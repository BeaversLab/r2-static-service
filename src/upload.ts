import { sha256 } from 'hono/utils/crypto'
import { FILE_FIELD_NAME } from './constants.ts'
import { buildObjectKey, buildSeoFilename, getFileExtension, toHashPrefix } from './path.ts'
import { encryptToken } from './crypto.ts'
import { createQiniuUploadToken } from './qiniu.ts'
import type { AppConfig } from './types.ts'

export const storeUploadedFile = async (
  requestUrl: string,
  file: File,
  storageId: string,
  env: Cloudflare.Env,
  config: AppConfig
) => {
  const bytes = await file.arrayBuffer()
  const hash = await sha256(new Uint8Array(bytes))
  const extension = getFileExtension(file.name, file.type)
  const key = buildObjectKey(new Date(), hash, extension)
  const storage = config.storages[storageId]

  if (!storage) {
    throw new Error(`Unknown storage: ${storageId}`)
  }

  if (storage.type === 'r2') {
    await env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: {
        originalName: file.name || `${toHashPrefix(hash)}${extension ? `.${extension}` : ''}`,
        uploadedAt: new Date().toISOString(),
        extension
      }
    })
  } else {
    const secrets = config.storageSecrets[storageId]?.qiniu
    if (!secrets) {
      throw new Error(`Missing qiniu secrets for storage: ${storageId}`)
    }
    const uploadToken = await createQiniuUploadToken(storage, secrets, key)
    const formData = new FormData()
    formData.set('token', uploadToken)
    formData.set('key', key)
    formData.set('file', new File([bytes], file.name || `${toHashPrefix(hash)}${extension ? `.${extension}` : ''}`, {
      type: file.type || 'application/octet-stream'
    }))

    const uploadResponse = await fetch(storage.uploadUrl ?? 'https://upload.qiniup.com', {
      method: 'POST',
      body: formData
    })

    if (!uploadResponse.ok) {
      const responseText = await uploadResponse.text()
      throw new Error(`Qiniu upload failed: ${uploadResponse.status} ${responseText}`)
    }
  }

  const token = encryptToken(key, config.tokenSecret)
  const hashPrefix = toHashPrefix(hash)
  const seoFilename = buildSeoFilename(file.name || hashPrefix, hashPrefix, extension)
  const url = new URL(requestUrl)

  return {
    key: `${storageId}:${key}`,
    token,
    url: `${url.origin}/${encodeURIComponent(storageId)}/${token}/${seoFilename}`,
    contentType: file.type || 'application/octet-stream',
    size: file.size
  }
}

export const getFileFromBody = (body: Record<string, unknown>) => {
  const value = body[FILE_FIELD_NAME]
  return value instanceof File ? value : null
}

export const getStorageIdFromBody = (body: Record<string, unknown>, fallback: string) => {
  const value = body.storage_id
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
