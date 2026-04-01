import { sha256 } from 'hono/utils/crypto'
import { FILE_FIELD_NAME } from './constants.ts'
import { buildObjectKey, buildSeoFilename, getFileExtension, toHashPrefix } from './path.ts'
import { encryptToken } from './crypto.ts'

export const storeUploadedFile = async (
  requestUrl: string,
  file: File,
  env: Cloudflare.Env,
  tokenSecret: string
) => {
  const bytes = await file.arrayBuffer()
  const hash = await sha256(new Uint8Array(bytes))
  const extension = getFileExtension(file.name, file.type)
  const key = buildObjectKey(new Date(), hash, extension)

  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: {
      originalName: file.name || `${toHashPrefix(hash)}.${extension}`,
      uploadedAt: new Date().toISOString(),
      extension
    }
  })

  const token = encryptToken(key, extension, tokenSecret)
  const hashPrefix = toHashPrefix(hash)
  const seoFilename = buildSeoFilename(file.name || hashPrefix, hashPrefix, extension)
  const url = new URL(requestUrl)

  return {
    key,
    token,
    url: `${url.origin}/${token}/${seoFilename}`,
    contentType: file.type || 'application/octet-stream',
    size: file.size
  }
}

export const getFileFromBody = (body: Record<string, unknown>) => {
  const value = body[FILE_FIELD_NAME]
  return value instanceof File ? value : null
}
