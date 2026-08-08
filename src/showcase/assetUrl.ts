export function toShowcaseAssetUrl(path: string, baseUrl = import.meta.env.BASE_URL) {
  if (/^(?:https?:)?\/\//.test(path)) return path

  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${path.replace(/^\/+/, '')}`
}
