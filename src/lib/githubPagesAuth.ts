export const isGitHubPagesBuild = import.meta.env.VITE_DEPLOY_TARGET === 'github-pages'

const githubPagesBasePath = '/supplymate-wholesale/'

type SupabaseAuthFragment = {
  accessToken: string
  refreshToken: string
  type: string | null
}

type AuthCallbackLocation = {
  origin: string
  hash: string
  replace(url: string): void
}

type SetSession = (session: {
  access_token: string
  refresh_token: string
}) => PromiseLike<{ error: unknown }>

function withoutTrailingSlash(origin: string) {
  return origin.replace(/\/$/, '')
}

function getGitHubPagesRoute(origin: string, route: string) {
  return `${withoutTrailingSlash(origin)}${githubPagesBasePath}#${route}`
}

function getSupabaseCallbackParams(hash: string) {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  if (!fragment) return null

  const resetRoute = '/reset-password'
  if (fragment.startsWith(`${resetRoute}#`) || fragment.startsWith(`${resetRoute}?`)) {
    return new URLSearchParams(fragment.slice(resetRoute.length + 1))
  }

  if (fragment.startsWith('/')) return null
  return new URLSearchParams(fragment)
}

export function getPasswordResetRedirect(origin: string, pagesBuild: boolean) {
  if (pagesBuild) {
    return getGitHubPagesRoute(origin, '/reset-password')
  }

  return `${withoutTrailingSlash(origin)}/reset-password`
}

export function parseSupabaseAuthFragment(hash: string): SupabaseAuthFragment | null {
  const params = getSupabaseCallbackParams(hash)
  if (!params) return null
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken) return null

  return {
    accessToken,
    refreshToken,
    type: params.get('type'),
  }
}

export async function consumeGitHubPagesAuthCallback(
  location: AuthCallbackLocation,
  setSession: SetSession,
) {
  const params = getSupabaseCallbackParams(location.hash)
  const callback = parseSupabaseAuthFragment(location.hash)
  if (!callback) {
    if (!params) return false

    const hasAuthToken = params.has('access_token') || params.has('refresh_token')
    const hasAuthError = params.has('error') && params.has('error_code')
    if (!hasAuthToken && !hasAuthError) return false

    location.replace(getGitHubPagesRoute(location.origin, '/'))
    return true
  }

  let sessionAccepted = false
  try {
    const { error } = await setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    })
    sessionAccepted = !error
  } catch {
    sessionAccepted = false
  }

  const cleanRoute = sessionAccepted && callback.type === 'recovery' ? '/reset-password' : '/'
  location.replace(getGitHubPagesRoute(location.origin, cleanRoute))
  return true
}
