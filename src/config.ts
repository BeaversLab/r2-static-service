import * as z from 'zod'
import type { AppConfig, PolicyAction, RefererCategory, WatermarkScheme } from './types.ts'

const envSchema = z.object({
  UPLOAD_BEARER_TOKEN: z.string().min(1),
  TOKEN_SECRET: z.string().min(1),
  REFERER_ALLOWLIST: z.union([z.string(), z.array(z.string())]).optional(),
  REFERER_POLICY_ALLOWLIST: z.string().default('watermark:light'),
  REFERER_POLICY_NO_REFERER: z.string().default('watermark:light'),
  REFERER_POLICY_OTHER: z.string().default('watermark:strong'),
  WATERMARK_SCHEMES_JSON: z
    .union([
      z.string(),
      z.record(z.string(), z.unknown())
    ])
    .default({
      light: {
        type: 'text',
        text: 'Protected',
        opacity: 0.18,
        bottom: 24,
        right: 24,
        fontSize: 24,
        color: 'rgba(255,255,255,0.85)',
        width: 320,
        height: 72
      },
      strong: {
        type: 'text',
        text: 'Protected',
        opacity: 0.28,
        bottom: 20,
        right: 20,
        fontSize: 30,
        color: 'rgba(255,80,80,0.9)',
        width: 360,
        height: 88
      }
    })
})

const textSchemeSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  color: z.string().optional(),
  fontSize: z.number().int().positive().optional(),
  fontFamily: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
  top: z.number().int().nonnegative().optional(),
  right: z.number().int().nonnegative().optional(),
  bottom: z.number().int().nonnegative().optional(),
  left: z.number().int().nonnegative().optional(),
  repeat: z.boolean().optional()
})

const imageSchemeSchema = z.object({
  type: z.literal('image'),
  source: z.string().min(1),
  opacity: z.number().min(0).max(1).optional(),
  top: z.number().int().nonnegative().optional(),
  right: z.number().int().nonnegative().optional(),
  bottom: z.number().int().nonnegative().optional(),
  left: z.number().int().nonnegative().optional(),
  repeat: z.boolean().optional()
})

const watermarkSchemesSchema = z.record(z.string(), z.union([textSchemeSchema, imageSchemeSchema]))

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

const parseWatermarkSchemes = (value: string | Record<string, unknown>) =>
  watermarkSchemesSchema.parse(typeof value === 'string' ? JSON.parse(value) : value) as Record<
    string,
    WatermarkScheme
  >

export const getConfig = (env: Cloudflare.Env): AppConfig => {
  const parsed = envSchema.parse(env)
  const watermarkSchemes = parseWatermarkSchemes(parsed.WATERMARK_SCHEMES_JSON)

  const refererPolicies = {
    allowlist: parsePolicyAction(parsed.REFERER_POLICY_ALLOWLIST),
    'no-referer': parsePolicyAction(parsed.REFERER_POLICY_NO_REFERER),
    other: parsePolicyAction(parsed.REFERER_POLICY_OTHER)
  } satisfies Record<RefererCategory, PolicyAction>

  for (const policy of Object.values(refererPolicies)) {
    if (policy.type === 'watermark' && !watermarkSchemes[policy.scheme]) {
      throw new Error(`Missing watermark scheme: ${policy.scheme}`)
    }
  }

  return {
    uploadBearerToken: parsed.UPLOAD_BEARER_TOKEN,
    tokenSecret: parsed.TOKEN_SECRET,
    refererAllowlist: normalizeAllowlist(parsed.REFERER_ALLOWLIST),
    refererPolicies,
    watermarkSchemes
  }
}
