import type { PolicyAction } from './types.ts'

const getCacheName = (action: PolicyAction) => {
  if (action.type === 'watermark') return `wm:${action.scheme}`
  return action.type
}

const getPreferredFormat = (acceptHeader: string | undefined) => {
  if (!acceptHeader) return 'original'
  if (acceptHeader.includes('image/avif')) return 'image/avif'
  if (acceptHeader.includes('image/webp')) return 'image/webp'
  return 'original'
}

export const buildCacheRequest = (
  request: Request,
  action: PolicyAction
) => {
  const url = new URL(request.url)
  url.searchParams.set('__policy', getCacheName(action))
  url.searchParams.set('__format', getPreferredFormat(request.headers.get('Accept') ?? undefined))
  return new Request(url.toString(), { method: 'GET' })
}
