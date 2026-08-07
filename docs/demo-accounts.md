# SupplyMate demo access

SupplyMate Wholesale is a self-initiated concept demo created to showcase a realistic Thai
B2B wholesale purchasing workflow.

Demo credentials will be provisioned separately for each environment and are never committed to
this repository. Buyer and admin verification roles are required for a future hosted smoke test;
access must be requested from the project owner after the environment exists.

The intended URL is `https://phakinza007.github.io/supplymate-wholesale/`. It is not a deployed
demo yet: hosted Supabase configuration, repository secrets, a manual Pages workflow run, and a
hosted smoke test are still pending. Supabase Auth must allow the redirect
`https://phakinza007.github.io/supplymate-wholesale/` before sign-in is tested.

The password-recovery callback used in the browser is
`https://phakinza007.github.io/supplymate-wholesale/#/reset-password`. The full redirect URL is
supplied to Supabase, but the fragment is stripped for server-side allowlist matching and is not
included in the browser's HTTP request to GitHub Pages. The base URL above therefore remains the
Supabase allowlist entry. The app consumes the recovery session before replacing token-bearing or
auth-error fragments with a clean hash route.

No buyer, admin, Supabase, or payment credentials are published here.
