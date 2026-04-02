import { CACHE_MAX_AGE } from './constants.ts'
import {
  imageParameterNames,
  imageParameterSchema,
  isSupportedImageExtension,
  type ImageParameters
} from './image.ts'
import type {
  AppConfig,
  ImageProxyWatermarkScheme,
  PolicyAction,
  StorageConfig
} from './types.ts'

const buildResponseHeaders = (contentType: string) => ({
  'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
  'Content-Type': contentType
})

const UPSTREAM_ACCEPT = 'image/avif,image/webp,image/*,*/*;q=0.8'
const UPSTREAM_USER_AGENT = 'Mozilla/5.0 (compatible; BeaversLabImageProxy/1.0)'
const toBase64Url = (value: string) =>
  btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
const toHexAlpha = (opacity: number | undefined) =>
  Math.round(255 * Math.min(1, Math.max(0, opacity ?? 1)))
    .toString(16)
    .padStart(2, '0')
const withOpacity = (color: string | undefined, opacity: number | undefined) => {
  if (!color) return undefined
  const normalized = color.replace(/^#/, '').toLowerCase()
  const rgb = normalized.length === 8 ? normalized.slice(0, 6) : normalized
  return `${rgb}${toHexAlpha(opacity)}`
}

const hasImageParameters = (query: Record<string, string>) =>
  imageParameterNames.some((key) => query[key] !== undefined)

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

const appendSearchParams = (baseUrl: string, entries: Array<[string, string]>) => {
  if (entries.length === 0) return baseUrl
  const query = entries
    .map(([key, value]) => {
      const encodedKey = encodeURIComponent(key)
      const encodedValue =
        key === 'visual_effect'
          ? encodeURIComponent(value).replace(/%2C/g, ',')
          : encodeURIComponent(value)
      return `${encodedKey}=${encodedValue}`
    })
    .join('&')
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query}`
}

const buildSourceUrl = (storage: StorageConfig, path: string) =>
  `${storage.publicBaseUrl.replace(/\/+$/, '')}/${encodePath(path)}`

const encodeVisualEffect = (scheme: ImageProxyWatermarkScheme) => {
  const parts = ['watermark']
  const append = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return
    parts.push(`${key}__${value}`)
  }

  append('text', toBase64Url(scheme.text))
  append('font', scheme.font ? toBase64Url(scheme.font) : undefined)
  append('color', withOpacity(scheme.color, scheme.colorOpacity))
  append('fill', withOpacity(scheme.fill, scheme.fillOpacity))
  append('width', scheme.width)
  append('height', scheme.height)
  append('offset_x', scheme.offsetX)
  append('offset_y', scheme.offsetY)

  return parts.join(',')
}

const buildProxyUrl = (
  storage: StorageConfig,
  path: string,
  parameters: ImageParameters,
  action: PolicyAction,
  config: AppConfig
) => {
  const baseUrl = `${storage.proxyBaseUrl.replace(/\/+$/, '')}/${encodePath(path)}`
  const entries: Array<[string, string]> = []

  if (parameters.width) entries.push(['width', String(parameters.width)])
  if (parameters.height) entries.push(['height', String(parameters.height)])
  if (parameters.max_width) entries.push(['max_width', String(parameters.max_width)])
  if (parameters.max_height) entries.push(['max_height', String(parameters.max_height)])
  if (parameters.quality) entries.push(['quality', String(parameters.quality)])
  if (parameters.blur !== undefined) entries.push(['blur', String(parameters.blur)])
  if (parameters.sharpen !== undefined) entries.push(['sharpen', String(parameters.sharpen)])
  if (parameters.rotate !== undefined) entries.push(['rotate', String(parameters.rotate)])
  if (parameters.brightness !== undefined) entries.push(['brightness', String(parameters.brightness)])
  if (parameters.saturation !== undefined) entries.push(['saturation', String(parameters.saturation)])
  if (parameters.contrast !== undefined) entries.push(['contrast', String(parameters.contrast)])
  if (parameters.flip) entries.push(['flip', parameters.flip])

  if (action.type === 'watermark') {
    const scheme = config.imageProxyWatermarkSchemes[action.scheme]
    if (!scheme) {
      throw new Error(`Missing watermark scheme: ${action.scheme}`)
    }
    entries.push(['visual_effect', encodeVisualEffect(scheme)])
  }

  return appendSearchParams(baseUrl, entries)
}

const fetchPassThrough = async (url: string) => {
  const upstream = await fetch(url, {
    redirect: 'manual',
    headers: {
      Accept: UPSTREAM_ACCEPT,
      'User-Agent': UPSTREAM_USER_AGENT
    }
  })

  console.log(JSON.stringify({
    upstreamUrl: url,
    status: upstream.status,
    location: upstream.headers.get('Location'),
    contentType: upstream.headers.get('Content-Type')
  }))

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildResponseHeaders(upstream.headers.get('Content-Type') ?? 'application/octet-stream')
  })
}

export const buildStorageObjectResponse = async (
  storage: StorageConfig,
  path: string,
  extension: string,
  query: Record<string, string>,
  action: PolicyAction,
  config: AppConfig
) => {
  if (!isSupportedImageExtension(extension)) {
    return fetchPassThrough(buildSourceUrl(storage, path))
  }

  const parsedQuery = imageParameterSchema.safeParse(query)
  if (!parsedQuery.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid image transformation parameters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const shouldUseProxy = hasImageParameters(query) || action.type === 'watermark'
  if (!shouldUseProxy) {
    return fetchPassThrough(buildSourceUrl(storage, path))
  }

  let proxyUrl: string
  try {
    proxyUrl = buildProxyUrl(storage, path, parsedQuery.data, action, config)
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid image transformation parameters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return fetchPassThrough(proxyUrl)
}
