import { getExtension } from 'hono/utils/mime'
import { HASH_LENGTH } from './constants.ts'

const normalizeExtension = (value: string | null | undefined) => value?.toLowerCase().replace(/^\./, '') ?? ''

const extensionFromFilename = (filename: string) => {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export const getFileExtension = (filename: string, contentType: string) => {
  const filenameExtension = normalizeExtension(extensionFromFilename(filename))
  const mimeExtension = normalizeExtension(getExtension(contentType))
  return filenameExtension || (mimeExtension === 'bin' ? '' : mimeExtension)
}

export const getObjectKeyExtension = (path: string) => {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export const getObjectKeyStem = (path: string) => path.replace(/\.[^.]+$/, '')

export const toHashPrefix = (hashHex: string) => hashHex.slice(0, HASH_LENGTH)

export const buildObjectKey = (date: Date, hashHex: string, extension: string) => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const suffix = extension ? `.${extension}` : ''
  return `${year}/${month}/${day}/${toHashPrefix(hashHex)}${suffix}`
}

export const buildSeoFilename = (filename: string, hashPrefix: string, extension: string) => {
  const base = filename.replace(/\.[^.]+$/, '')
  const slug = base
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  const suffix = extension ? `.${extension}` : ''
  return `${slug || hashPrefix}${suffix}`
}
