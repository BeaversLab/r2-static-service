import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const textEncoder = new TextEncoder()

const printUsage = () => {
  console.error(
    'Usage: node test/resourse/qiniu-direct-upload.mjs <accessKey> <secretKey> <bucket> <filePath> [key] [uploadUrl] [scopeMode]'
  )
  console.error('scopeMode: bucket | bucket-key (default: bucket-key)')
}

const toUrlSafeBase64 = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const signHmacSha1 = async (value, secretKey) => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))
  return Buffer.from(new Uint8Array(signature))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

const detectContentType = (filePath) => {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

const buildToken = async ({ accessKey, secretKey, bucket, key, scopeMode }) => {
  const putPolicy = JSON.stringify({
    scope: scopeMode === 'bucket' ? bucket : `${bucket}:${key}`,
    deadline: Math.floor(Date.now() / 1000) + 60 * 60
  })
  const encodedPolicy = toUrlSafeBase64(putPolicy)
  const encodedSign = await signHmacSha1(encodedPolicy, secretKey)
  return {
    putPolicy,
    encodedPolicy,
    token: `${accessKey}:${encodedSign}:${encodedPolicy}`
  }
}

const main = async () => {
  const [accessKey, secretKey, bucket, filePath, keyArg, uploadUrlArg, scopeModeArg] = process.argv.slice(2)
  if (!accessKey || !secretKey || !bucket || !filePath) {
    printUsage()
    process.exit(1)
  }

  const uploadUrl = uploadUrlArg || 'https://upload.qiniup.com'
  const key = keyArg || basename(filePath)
  const scopeMode = scopeModeArg || 'bucket-key'

  if (!['bucket', 'bucket-key'].includes(scopeMode)) {
    console.error(`Unsupported scope mode: ${scopeMode}`)
    process.exit(1)
  }

  const bytes = await readFile(filePath)
  const contentType = detectContentType(filePath)
  const { putPolicy, encodedPolicy, token } = await buildToken({
    accessKey,
    secretKey,
    bucket,
    key,
    scopeMode
  })

  console.log('putPolicy=', putPolicy)
  console.log('encodedPolicy=', encodedPolicy)
  console.log('token=', token)
  console.log('uploadUrl=', uploadUrl)
  console.log('key=', key)
  console.log('contentType=', contentType)

  const formData = new FormData()
  formData.set('token', token)
  formData.set('key', key)
  formData.set('file', new File([bytes], basename(filePath), { type: contentType }))

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  })

  const body = await response.text()
  console.log('status=', response.status)
  console.log('response=', body)
}

if (process.argv.length > 2) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
