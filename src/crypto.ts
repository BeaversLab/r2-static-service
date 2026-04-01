import { TOKEN_VERSION } from './constants.ts'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

const xorBytes = (payload: Uint8Array, secret: Uint8Array) => {
  const result = new Uint8Array(payload.length)
  for (let index = 0; index < payload.length; index += 1) {
    result[index] = payload[index] ^ secret[index % secret.length]
  }
  return result
}

export const encryptToken = (path: string, extension: string, secret: string) => {
  const payload = textEncoder.encode(`${TOKEN_VERSION}|${path}|${extension}`)
  const key = textEncoder.encode(secret)
  return toBase64Url(xorBytes(payload, key))
}

export const decryptToken = (token: string, secret: string) => {
  try {
    const decrypted = xorBytes(fromBase64Url(token), textEncoder.encode(secret))
    const [version, path, extension] = textDecoder.decode(decrypted).split('|')
    if (version !== TOKEN_VERSION || !path || !extension) {
      throw new Error('Invalid token payload')
    }
    return { path, extension }
  } catch {
    throw new Error('Invalid token')
  }
}
