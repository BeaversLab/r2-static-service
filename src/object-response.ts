import { CACHE_MAX_AGE } from './constants.ts'
import {
  getPreferredContentType,
  imageParameterNames,
  imageParameterSchema,
  isSupportedImageExtension
} from './image.ts'
import { resolveWatermark } from './watermark.ts'
import type { AppConfig, PolicyAction } from './types.ts'

const hasImageParameters = (query: Record<string, string>) =>
  imageParameterNames.some((key) => query[key] !== undefined)

const buildResponseHeaders = (contentType: string) => ({
  'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
  'Content-Type': contentType
})

export const buildObjectResponse = async (
  object: R2ObjectBody,
  extension: string,
  query: Record<string, string>,
  acceptHeader: string | undefined,
  action: PolicyAction,
  config: AppConfig,
  images: ImagesBinding | undefined
) => {
  const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream'
  const imageTransformRequested = hasImageParameters(query) || action.type === 'watermark'
  const canTransform =
    Boolean(images) &&
    isSupportedImageExtension(extension) &&
    imageTransformRequested

  if (!canTransform) {
    const data = await object.arrayBuffer()
    return new Response(data, {
      status: 200,
      headers: buildResponseHeaders(contentType)
    })
  }

  const parsedQuery = imageParameterSchema.safeParse(query)
  if (!parsedQuery.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid image transformation parameters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let transformer = images!.input(object.body)
  const parameters = parsedQuery.data

  if (Object.keys(parameters).length > 0) {
    transformer = transformer.transform(parameters)
  }

  const watermark = await resolveWatermark(action, config.watermarkSchemes)
  if (watermark) {
    transformer = transformer.draw(watermark.image, watermark.drawOptions)
  }

  const preferredContentType = getPreferredContentType(acceptHeader, contentType)
  const imageResult = await transformer.output({
    format: preferredContentType as ImageOutputOptions['format'],
    quality: parameters.quality
  })
  const response = imageResult.response()
  response.headers.set('Cache-Control', `public, max-age=${CACHE_MAX_AGE}`)
  return response
}
