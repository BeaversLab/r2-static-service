import { TOKEN_VERSION } from './constants.ts'
import { getObjectKeyExtension, getObjectKeyStem } from './path.ts'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const BASE17_ALPHABET = '0123456789abcdef/'
const BASE62_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

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

const convertBase = (value: string, fromAlphabet: string, toAlphabet: string) => {
  if (!value) return toAlphabet[0]

  const fromBase = BigInt(fromAlphabet.length)
  const toBase = BigInt(toAlphabet.length)

  let decimalValue = 0n
  for (const char of value) {
    const index = fromAlphabet.indexOf(char)
    if (index < 0) {
      throw new Error(`Unsupported token character: ${char}`)
    }
    decimalValue = decimalValue * fromBase + BigInt(index)
  }

  if (decimalValue === 0n) {
    return toAlphabet[0]
  }

  let output = ''
  while (decimalValue > 0n) {
    const remainder = Number(decimalValue % toBase)
    output = `${toAlphabet[remainder]}${output}`
    decimalValue /= toBase
  }
  return output
}

const compressObjectKey = (path: string) => {
  const extension = getObjectKeyExtension(path)
  const stem = getObjectKeyStem(path)
  if (!stem) {
    throw new Error('Invalid object key')
  }
  return {
    compactStem: convertBase(stem, BASE17_ALPHABET, BASE62_ALPHABET),
    extension
  }
}

const expandObjectKey = (compactStem: string, extension: string) => {
  const stem = convertBase(compactStem, BASE62_ALPHABET, BASE17_ALPHABET)
  return extension ? `${stem}.${extension}` : stem
}

export const buildTokenPayload = (path: string) => {
  const { compactStem, extension } = compressObjectKey(path)
  return `${TOKEN_VERSION}|${compactStem}|${extension}`
}

export const encryptToken = (path: string, secret: string) => {
  const payload = textEncoder.encode(buildTokenPayload(path))
  const key = textEncoder.encode(secret)
  return toBase64Url(xorBytes(payload, key))
}

export const decryptToken = (token: string, secret: string) => {
  try {
    const decrypted = xorBytes(fromBase64Url(token), textEncoder.encode(secret))
    const [version, compactStem, extension] = textDecoder.decode(decrypted).split('|')
    if (version !== TOKEN_VERSION || !compactStem || extension === undefined) {
      throw new Error('Invalid token payload')
    }
    const path = expandObjectKey(compactStem, extension)
    return { path, extension }
  } catch {
    throw new Error('Invalid token')
  }
}
