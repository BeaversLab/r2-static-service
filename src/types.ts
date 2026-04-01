export type WatermarkScheme =
  | {
      type: 'text'
      text: string
      color?: string
      fontSize?: number
      fontFamily?: string
      width?: number
      height?: number
      opacity?: number
      top?: number
      right?: number
      bottom?: number
      left?: number
      repeat?: boolean
    }
  | {
      type: 'image'
      source: string
      opacity?: number
      top?: number
      right?: number
      bottom?: number
      left?: number
      repeat?: boolean
    }

export type PolicyAction =
  | { type: 'reject' }
  | { type: 'none' }
  | { type: 'watermark'; scheme: string }

export type RefererCategory = 'allowlist' | 'no-referer' | 'other'

export type AppConfig = {
  uploadBearerToken: string
  tokenSecret: string
  refererAllowlist: string[]
  refererPolicies: Record<RefererCategory, PolicyAction>
  watermarkSchemes: Record<string, WatermarkScheme>
}
