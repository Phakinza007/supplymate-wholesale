import type { ReactNode } from 'react'
import { brandConfig } from '@/config/branding.config'

interface AuthShellProps {
  title: string
  /** One line of context. Auth screens are where a rushed buyer bails. */
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/**
 * The four auth screens shared a hand-copied centred layout that had drifted
 * apart. One shell keeps the brand mark, spacing and card identical across
 * log in, sign up, and both halves of the password reset.
 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-3">
        <img
          src={brandConfig.logoUrl}
          alt=""
          className="size-10 rounded-md border border-border"
        />
        <div>
          <h1 className="text-[length:var(--text-app-title)] font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="rounded-md border border-border bg-card p-5">{children}</div>
      {/* Links here are how a stuck buyer leaves this screen; give them a
          real touch target rather than the height of their own text. */}
      {footer && (
        <div className="text-sm text-muted-foreground [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
          {footer}
        </div>
      )}
    </div>
  )
}
