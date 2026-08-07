import { describe, expect, it, vi } from 'vitest'
import {
  consumeGitHubPagesAuthCallback,
  getPasswordResetRedirect,
  parseSupabaseAuthFragment,
} from '@/lib/githubPagesAuth'

describe('GitHub Pages auth URLs', () => {
  it('keeps the local reset callback on the BrowserRouter path', () => {
    expect(getPasswordResetRedirect('http://localhost:5173', false)).toBe(
      'http://localhost:5173/reset-password',
    )
  })

  it('uses the repository hash route for the Pages reset callback', () => {
    expect(getPasswordResetRedirect('https://phakinza007.github.io', true)).toBe(
      'https://phakinza007.github.io/supplymate-wholesale/#/reset-password',
    )
  })
})

describe('Supabase implicit auth fragments', () => {
  it('parses a recovery session without exposing unrelated fragment values', () => {
    expect(
      parseSupabaseAuthFragment(
        '#access_token=access-value&refresh_token=refresh-value&type=recovery&expires_in=3600',
      ),
    ).toEqual({
      accessToken: 'access-value',
      refreshToken: 'refresh-value',
      type: 'recovery',
    })
  })

  it('parses tokens appended after the requested hash route', () => {
    expect(
      parseSupabaseAuthFragment(
        '#/reset-password#access_token=access-value&refresh_token=refresh-value&type=recovery',
      ),
    ).toEqual({
      accessToken: 'access-value',
      refreshToken: 'refresh-value',
      type: 'recovery',
    })
  })

  it.each(['', '#/shop', '#type=recovery', '#access_token=access-value&type=recovery'])(
    'ignores a non-session fragment: %s',
    (hash) => {
      expect(parseSupabaseAuthFragment(hash)).toBeNull()
    },
  )

  it('sets a recovery session before replacing the token fragment with a clean route', async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null })
    const replace = vi.fn()

    const consumed = await consumeGitHubPagesAuthCallback(
      {
        origin: 'https://phakinza007.github.io',
        hash: '#access_token=access-value&refresh_token=refresh-value&type=recovery',
        replace,
      },
      setSession,
    )

    expect(consumed).toBe(true)
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access-value',
      refresh_token: 'refresh-value',
    })
    expect(replace).toHaveBeenCalledWith(
      'https://phakinza007.github.io/supplymate-wholesale/#/reset-password',
    )
  })

  it('does nothing when the fragment has no complete session', async () => {
    const setSession = vi.fn()
    const replace = vi.fn()

    const consumed = await consumeGitHubPagesAuthCallback(
      {
        origin: 'https://phakinza007.github.io',
        hash: '#/shop',
        replace,
      },
      setSession,
    )

    expect(consumed).toBe(false)
    expect(setSession).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('removes an incomplete token fragment before HashRouter can consume it', async () => {
    const setSession = vi.fn()
    const replace = vi.fn()

    const consumed = await consumeGitHubPagesAuthCallback(
      {
        origin: 'https://phakinza007.github.io',
        hash: '#access_token=access-value&type=recovery',
        replace,
      },
      setSession,
    )

    expect(consumed).toBe(true)
    expect(setSession).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith(
      'https://phakinza007.github.io/supplymate-wholesale/#/',
    )
  })

  it.each([
    '#error=access_denied&error_code=otp_expired&error_description=Reset+link+expired',
    '#/reset-password#error=access_denied&error_code=otp_expired&error_description=Reset+link+expired',
  ])('removes a Supabase error callback before HashRouter mounts: %s', async (hash) => {
    const setSession = vi.fn()
    const replace = vi.fn()

    const consumed = await consumeGitHubPagesAuthCallback(
      {
        origin: 'https://phakinza007.github.io',
        hash,
        replace,
      },
      setSession,
    )

    expect(consumed).toBe(true)
    expect(setSession).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith(
      'https://phakinza007.github.io/supplymate-wholesale/#/',
    )
  })

  it('leaves an ordinary shop error query for HashRouter to render', async () => {
    const setSession = vi.fn()
    const replace = vi.fn()

    const consumed = await consumeGitHubPagesAuthCallback(
      {
        origin: 'https://phakinza007.github.io',
        hash: '#/shop?error=inventory&error_description=Unavailable',
        replace,
      },
      setSession,
    )

    expect(consumed).toBe(false)
    expect(setSession).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('cleans a non-recovery confirmation session to the Pages home route', async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null })
    const replace = vi.fn()

    await consumeGitHubPagesAuthCallback(
      {
        origin: 'https://phakinza007.github.io',
        hash: '#access_token=access-value&refresh_token=refresh-value&type=signup',
        replace,
      },
      setSession,
    )

    expect(replace).toHaveBeenCalledWith(
      'https://phakinza007.github.io/supplymate-wholesale/#/',
    )
  })

  it('removes the token fragment without opening reset when the session is rejected', async () => {
    const setSession = vi.fn().mockResolvedValue({ error: new Error('invalid session') })
    const replace = vi.fn()

    await consumeGitHubPagesAuthCallback(
      {
        origin: 'https://phakinza007.github.io',
        hash: '#access_token=access-value&refresh_token=refresh-value&type=recovery',
        replace,
      },
      setSession,
    )

    expect(replace).toHaveBeenCalledWith(
      'https://phakinza007.github.io/supplymate-wholesale/#/',
    )
  })
})
