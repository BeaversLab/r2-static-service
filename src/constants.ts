export const CACHE_MAX_AGE = 60 * 60 * 24 * 30
export const FILE_FIELD_NAME = 'file'
export const TOKEN_VERSION = 'v1'
export const HASH_LENGTH = 12

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif'
])

export const PREFERRED_OUTPUT_TYPES = ['image/avif', 'image/webp'] as const
