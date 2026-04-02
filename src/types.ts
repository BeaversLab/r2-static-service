export type ImageProxyWatermarkScheme = {
  text: string
  font?: string
  color?: string
  colorOpacity?: number
  fill?: string
  fillOpacity?: number
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
}

export type PolicyAction =
  | { type: 'reject' }
  | { type: 'none' }
  | { type: 'watermark'; scheme: string }

export type RefererCategory = 'allowlist' | 'no-referer' | 'other'

export type R2StorageConfig = {
  type: 'r2'
  publicBaseUrl: string
  proxyBaseUrl: string
}

export type QiniuStorageConfig = {
  type: 'qiniu'
  bucket: string
  publicBaseUrl: string
  proxyBaseUrl: string
  uploadUrl?: string
}

export type StorageConfig = R2StorageConfig | QiniuStorageConfig

export type QiniuStorageSecrets = {
  accessKey: string
  secretKey: string
}

export type StorageSecrets = {
  qiniu?: QiniuStorageSecrets
}

export type AppConfig = {
  uploadBearerToken: string
  tokenSecret: string
  refererAllowlist: string[]
  refererPolicies: Record<RefererCategory, PolicyAction>
  imageProxyWatermarkSchemes: Record<string, ImageProxyWatermarkScheme>
  currentStorage: string
  storages: Record<string, StorageConfig>
  storageSecrets: Record<string, StorageSecrets>
}
