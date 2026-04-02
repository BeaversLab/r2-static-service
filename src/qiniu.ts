import type { QiniuStorageConfig, QiniuStorageSecrets } from './types.ts'

const textEncoder = new TextEncoder()

const toUrlSafeBase64 = (value: string) =>
  btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const signHmacSha1 = async (value: string, secretKey: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))
  return new Uint8Array(signature)
}

const toUrlSafeBase64Bytes = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

export const createQiniuUploadToken = async (
  storage: QiniuStorageConfig,
  secrets: QiniuStorageSecrets,
  key: string,
) => {
  const putPolicy = JSON.stringify({
    scope: `${storage.bucket}:${key}`,
    deadline: Math.floor(Date.now() / 1000) + 60 * 60
  })

  const encodedPolicy = toUrlSafeBase64(putPolicy)
  const signature = await signHmacSha1(encodedPolicy, secrets.secretKey)
  return `${secrets.accessKey}:${toUrlSafeBase64Bytes(signature)}:${encodedPolicy}`
}
