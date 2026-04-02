import * as z from 'zod'
import type {
  AppConfig,
  ImageProxyWatermarkScheme,
  PolicyAction,
  RefererCategory,
  StorageConfig,
  StorageSecrets
} from './types.ts'

const envSchema = z.object({
  UPLOAD_BEARER_TOKEN: z.string().min(1),
  TOKEN_SECRET: z.string().min(1),
  CURRENT_STORAGE: z.string().default('r2'),
  STORAGE_CONFIGS_JSON: z
    .union([
      z.string(),
      z.record(z.string(), z.unknown())
    ])
    .default({
      r2: {
        type: 'r2',
        publicBaseUrl: 'https://origin.example.com',
        proxyBaseUrl: 'https://proxy.example.com'
      }
    }),
  STORAGE_SECRETS_JSON: z
    .union([
      z.string(),
      z.record(z.string(), z.unknown())
    ])
    .default({}),
  IMAGE_PROXY_WATERMARK_SCHEMES_JSON: z
    .union([
      z.string(),
      z.record(z.string(), z.unknown())
    ])
    .default({
      light: {
        text: 'Protected',
        font: 'Source Han Sans HC VF',
        color: 'FFFFFF',
        colorOpacity: 1,
        fill: 'FFFFFF',
        fillOpacity: 0,
        width: 0.28,
        height: 0.0904,
        offsetX: 0.04,
        offsetY: 0.04
      },
      strong: {
        text: 'Protected',
        font: 'Source Han Sans HC VF',
        color: 'FF5050',
        colorOpacity: 1,
        fill: 'FFFFFF',
        fillOpacity: 0,
        width: 0.36,
        height: 0.0904,
        offsetX: 0.04,
        offsetY: 0.04
      }
    }),
  REFERER_ALLOWLIST: z.union([z.string(), z.array(z.string())]).optional(),
  REFERER_POLICY_ALLOWLIST: z.string().default('watermark:light'),
  REFERER_POLICY_NO_REFERER: z.string().default('watermark:light'),
  REFERER_POLICY_OTHER: z.string().default('watermark:strong')
})

const imageProxyWatermarkSchemeSchema = z.object({
  text: z.string().min(1),
  font: z.string().optional(),
  color: z.string().optional(),
  colorOpacity: z.number().min(0).max(1).optional(),
  fill: z.string().optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  offsetX: z.number().min(0).max(1).optional(),
  offsetY: z.number().min(0).max(1).optional()
})

const imageProxyWatermarkSchemesSchema = z.record(z.string(), imageProxyWatermarkSchemeSchema)

const r2StorageSchema = z.object({
  type: z.literal('r2'),
  publicBaseUrl: z.string().url(),
  proxyBaseUrl: z.string().url()
})

const qiniuStorageSchema = z.object({
  type: z.literal('qiniu'),
  bucket: z.string().min(1),
  publicBaseUrl: z.string().url(),
  proxyBaseUrl: z.string().url(),
  uploadUrl: z.string().url().optional()
})

const storageConfigsSchema = z.record(z.string(), z.union([r2StorageSchema, qiniuStorageSchema]))
const storageSecretsSchema = z.record(z.string(), z.object({
  qiniu: z.object({
    accessKey: z.string().min(1),
    secretKey: z.string().min(1)
  }).optional()
}))

const parsePolicyAction = (value: string): PolicyAction => {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === 'none') {
    return { type: 'none' }
  }
  if (normalized === 'reject') {
    return { type: 'reject' }
  }
  if (normalized.startsWith('watermark:')) {
    const scheme = normalized.slice('watermark:'.length).trim()
    if (!scheme) {
      throw new Error(`Invalid watermark policy: ${value}`)
    }
    return { type: 'watermark', scheme }
  }
  throw new Error(`Unsupported policy action: ${value}`)
}

const normalizeAllowlist = (value?: string | string[]) => {
  if (!value) return []
  const items = Array.isArray(value) ? value : value.split(',')
  return items.map((entry) => entry.trim().toLowerCase()).filter(Boolean)
}

const parseImageProxyWatermarkSchemes = (value: string | Record<string, unknown>) =>
  imageProxyWatermarkSchemesSchema.parse(typeof value === 'string' ? JSON.parse(value) : value) as Record<
    string,
    ImageProxyWatermarkScheme
  >

const parseStorageConfigs = (value: string | Record<string, unknown>) =>
  storageConfigsSchema.parse(typeof value === 'string' ? JSON.parse(value) : value) as Record<
    string,
    StorageConfig
  >

const parseStorageSecrets = (value: string | Record<string, unknown>) =>
  storageSecretsSchema.parse(typeof value === 'string' ? JSON.parse(value) : value) as Record<
    string,
    StorageSecrets
  >

export const getConfig = (env: Cloudflare.Env): AppConfig => {
  const parsed = envSchema.parse(env)
  const storages = parseStorageConfigs(parsed.STORAGE_CONFIGS_JSON)
  const storageSecrets = parseStorageSecrets(parsed.STORAGE_SECRETS_JSON)
  const imageProxyWatermarkSchemes = parseImageProxyWatermarkSchemes(parsed.IMAGE_PROXY_WATERMARK_SCHEMES_JSON)
  const currentStorage = parsed.CURRENT_STORAGE.trim()

  if (!storages[currentStorage]) {
    throw new Error(`Missing storage config: ${currentStorage}`)
  }

  const refererPolicies = {
    allowlist: parsePolicyAction(parsed.REFERER_POLICY_ALLOWLIST),
    'no-referer': parsePolicyAction(parsed.REFERER_POLICY_NO_REFERER),
    other: parsePolicyAction(parsed.REFERER_POLICY_OTHER)
  } satisfies Record<RefererCategory, PolicyAction>

  for (const policy of Object.values(refererPolicies)) {
    if (
      policy.type === 'watermark' &&
      !imageProxyWatermarkSchemes[policy.scheme]
    ) {
      throw new Error(`Missing watermark scheme: ${policy.scheme}`)
    }
  }

  return {
    uploadBearerToken: parsed.UPLOAD_BEARER_TOKEN,
    tokenSecret: parsed.TOKEN_SECRET,
    refererAllowlist: normalizeAllowlist(parsed.REFERER_ALLOWLIST),
    refererPolicies,
    imageProxyWatermarkSchemes,
    currentStorage,
    storages,
    storageSecrets
  }
}
