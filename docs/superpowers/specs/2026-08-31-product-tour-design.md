# Product tour — design

**Status:** approved design, pending implementation plan
**Surface:** the real Supabase-backed app (Vercel), not the static showcase
**Flag:** `features.productTour`

## Why

A visitor lands on `/shop` and sees a catalogue. What they do not see is the
thing that makes this a *wholesale* kit rather than a shop: prices that fall as
quantity rises, order minimums expressed in cartons, and a total that re-prices
itself server-side. Those are three screens apart and none of them announces
itself.

The tour walks a first-time visitor through that path once, and gets out of the
way.

## Non-goals

- Teaching the admin back office. Buyer journey only.
- Replacing the standing demo disclosure. That notice is a legal statement about
  the data; the tour is an explanation of the product. They are different jobs.
- Any form of guest checkout. See "The checkout wall".

## Constraint that shapes everything: no login

The tour must run start to finish for a visitor who never signs in. This rules
out any step that depends on a session, and it rules out the tour creating one.

### The checkout wall

`/checkout` sits behind `<ProtectedRoute />`, and it must: orders carry a
`user_id` and RLS scopes every read to the owner. That is not a setting to
relax — a logged-out checkout means guest orders, which is a schema and RLS
change, and a separate piece of work from a tour.

So the tour has two endings, chosen at runtime from `useAuth()`:

- **Logged out (the designed-for case):** the last step is the cart summary, and
  its copy names what comes next — sign in, pick an address, choose how to pay,
  attach a slip — without navigating there. The visitor is told, not blocked.
- **Logged in:** the tour continues into `/checkout`, highlights the payment
  method choice and the order summary, and **stops before the order button**.

The second ending is a conditional tail on the step list, not a second tour.

## Architecture

### An optional module, gated by a flag

`src/modules/optional/product-tour/`, following the established Phase 2 pattern:
`features.productTour` in `branding.config.ts`, mounted once in `SiteLayout`
via `lazy()` + `<Feature flag="productTour">` + `<Suspense fallback={null}>`.
A client who does not want a tour flips the flag and the code leaves the bundle.

### No tour library

driver.js, Shepherd and react-joyride all do most of this. We build it anyway,
for the same reason `src/lib/csv.ts` exists instead of a CSV package: this kit
is cloned per client, so a dependency added for one screen ships to every clone
forever. The bespoke requirements here — Thai copy, an auth-aware tail, waiting
on Supabase-loaded targets, and this project's own accessibility rules — are
ones we would be overriding a library to get.

### Units

| Unit | Responsibility | Testable by |
|---|---|---|
| `tourSteps.ts` | The step list as pure data. No DOM, no React. | unit |
| `stepSequence.ts` | Which step is next, given skipped/unavailable steps and auth state. | unit |
| `tooltipPosition.ts` | Target rect + viewport + tooltip size → placement, clamped inside the viewport. | unit |
| `waitForTarget.ts` | Resolve a `data-tour` anchor, or give up after a timeout. | unit (jsdom) |
| `TourOverlay.tsx` | Spotlight cut-out + tooltip. Presentation and accessibility. | E2E |
| `TourProvider.tsx` | State machine: index, routing, persistence, start/stop. | E2E |
| `index.tsx` | Composes the above; the lazy entry point. | E2E |

The three pure modules carry the logic most likely to be wrong. Positioning
maths and sequence-skipping are where hand-rolled tours break, and neither
needs a browser to test.

### Anchoring: `data-tour` attributes

Steps address targets by `data-tour="cart-summary"`, not CSS selectors. The
attribute is a stated contract: greppable, unaffected by Tailwind class churn,
and readable by the next person who moves the element.

Adding the attribute to a core component **does not violate the core/optional
boundary** — it is an inert HTML attribute, not an import. `check-core-boundary`
is a text-based import check and is unaffected.

### Targets that are not there yet

The real app loads its catalogue from Supabase, so a step's anchor may not exist
when the tour arrives. Every step resolution therefore waits, with a timeout,
and a step whose anchor never appears is **skipped, not blocked on**. A tour
that freezes because a query is slow is worse than no tour.

## The steps

| # | Route | Anchor | Point being made |
|---|---|---|---|
| 1 | `/` | `home-categories` | what the shop stocks |
| 2 | `/shop` | `catalogue-search` | how to find something |
| 3 | `/shop` | first card with `data-tour-tiers="true"` | some products get cheaper in bulk |
| 4 | `/products/:slug` | `tier-ladder` | the system applies the tier itself |
| 5 | `/products/:slug` | `quantity-calculator` | sold by the carton, with a minimum |
| 6 | `/products/:slug` | `add-to-cart` | **waits for the visitor's own click** |
| 7 | `/cart` | `cart-summary` | the total reflects the tier actually earned |
| 8 | `/checkout` | `payment-methods` | *logged-in tail only*; stops before ordering |

**Step 3 picks its product at runtime.** It scans the rendered grid for the
first card marked as having tiers and follows that link. No slug is hardcoded,
because the catalogue is live data that the shop owner edits. If no product has
tiers, steps 3 and 4 drop out and the tour continues at step 5 with whatever
product is first.

**Step 6 waits rather than acts.** The alternatives are both worse: if the tour
writes to the cart itself it has silently modified the visitor's real cart, and
if it skips the step the cart page it navigates to is empty and step 7 has
nothing to show. A "ข้าม" control keeps a visitor who will not click from
getting stuck.

## Rules the tour may not break

1. **It never operates a control that changes data.** No placing orders, no
   submitting forms, no writing to the cart. It highlights and it navigates.
   Step 6 *waits for* a click; it does not *perform* one.
2. **It never asks for or fills credentials.**
3. **It never auto-starts on a deep link.** A visitor who opened `/cart` from a
   shared URL is not dragged back to the home page.

## Accessibility

This is where packaged tours are weakest and where this project already has
standards.

- The tooltip is `role="dialog"` + `aria-modal="true"`, receives focus on open,
  traps Tab, and closes on Escape.
- The spotlight is decorative: `aria-hidden`, never focusable.
- Step position is announced ("ขั้นที่ 3 จาก 7") through a live region.
- `prefers-reduced-motion` removes the movement between steps; the tour still
  works, it just cuts rather than slides.
- Controls are 44px on mobile, matching the existing `min-h-11 sm:min-h-9` rule.
- **The tour never closes itself on a timer** — the same reasoning as
  `toaster.tsx`: timed disappearance is a WCAG 2.2.1 problem and makes people
  race the clock.

## Mobile

Below 640px the tooltip is a bottom sheet rather than an anchored popover; there
is not room to sit beside a highlighted element on a phone.

Scrolling a target into view must offset for `SiteHeader`, which is
`position: sticky` at `--z-sticky` (20). That same header is why the tour needs
its own layer above 20 — a backdrop underneath it would leave the header lit and
clickable while everything else is dimmed, which reads as a rendering fault. The
tour introduces `--z-tour` rather than an inline number, so the stack stays
readable next to the tokens already in `index.css`.

Note that the sticky buy bar referenced in `toaster.tsx` belongs to the static
showcase, not to this surface; the app's product page has no sticky footer to
avoid.

## Starting and stopping

- Auto-starts **once**, only for a first-time visitor whose entry point is `/`.
  Recorded in `localStorage` under `supplymate-tour-seen-v1`.
- A "ดูวิธีสั่งซื้อ" control in the site header restarts it at any time. This is
  the only entry point that matters after the first visit.
- Exiting is always available: Escape, a close button, or clicking the backdrop.
- The key is versioned so a materially rewritten tour can be shown again.

## Testing

- **Unit:** `tooltipPosition` (each placement, and clamping at all four edges),
  `stepSequence` (skips, the auth-dependent tail, first and last step
  behaviour), `waitForTarget` (resolves late, gives up on timeout).
- **E2E** (`e2e/product-tour.spec.ts`, guarded by
  `test.skip(!brandConfig.features.productTour, ...)` per the module
  convention): a logged-out visitor walks the whole tour, the tour ends at the
  cart, and **no order exists afterwards** — the last assertion is the one that
  matters, since the tour drives navigation through a checkout flow.
- A second E2E case covers the restart control and the "does not auto-start on a
  deep link" rule.
