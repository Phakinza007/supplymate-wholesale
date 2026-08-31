/**
 * Stands in for a product photo that does not exist yet.
 *
 * A catalogue without photos is the normal state early on — a client is still
 * shooting them, or a demo has none at all — and an empty `bg-muted` box reads
 * as a broken image rather than an absent one, which is the wrong impression
 * for a shop that simply has not photographed its stock yet.
 *
 * `label` is left off in the grid — ten cards each captioned "no photo" is
 * noise — and passed on the detail page, where a buyer looking straight at one
 * empty frame deserves to be told why it is empty.
 *
 * The crates echo the brandmark rather than a generic image icon, so a grid of
 * these looks deliberate instead of unfinished.
 */
export function ProductImageFallback({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="w-1/4 max-w-16 min-w-10 opacity-45"
        fill="currentColor"
      >
        <rect x="23" y="10.5" width="18" height="10" rx="2.5" opacity="0.5" />
        <rect x="19" y="24" width="26" height="12" rx="2.5" opacity="0.75" />
        <rect x="15" y="39.5" width="34" height="14" rx="2.5" />
      </svg>
      {label && (
        <span className="px-2 text-center text-xs font-semibold tabular-nums">{label}</span>
      )}
    </div>
  )
}
