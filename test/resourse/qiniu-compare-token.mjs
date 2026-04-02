import qiniu from 'qiniu'

const textEncoder = new TextEncoder()

const printUsage = () => {
  console.error(
    'Usage: node test/resourse/qiniu-compare-token.mjs <accessKey> <secretKey> <bucket> <key>'
  )
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

const main = async () => {
  const [accessKey, secretKey, bucket, key] = process.argv.slice(2)
  if (!accessKey || !secretKey || !bucket || !key) {
    printUsage()
    process.exit(1)
  }

  const deadline = Math.floor(Date.now() / 1000) + 60 * 60
  const putPolicy = JSON.stringify({
    scope: `${bucket}:${key}`,
    deadline
  })
  const encodedPolicy = toUrlSafeBase64(putPolicy)
  const signature = await signHmacSha1(encodedPolicy, secretKey)
  const customToken = `${accessKey}:${signature}:${encodedPolicy}`

  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
  const sdkPolicy = new qiniu.rs.PutPolicy({
    scope: `${bucket}:${key}`,
    deadline
  })
  const sdkToken = sdkPolicy.uploadToken(mac)

  console.log('putPolicy=', putPolicy)
  console.log('customToken=', customToken)
  console.log('sdkToken=', sdkToken)
  console.log('same=', customToken === sdkToken)
}

if (process.argv.length > 2) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
