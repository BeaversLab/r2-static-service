declare namespace Cloudflare {
  interface Env {
    UPLOAD_BEARER_TOKEN: string
    TOKEN_SECRET: string
    CURRENT_STORAGE?: string
    STORAGE_CONFIGS_JSON?: Record<string, unknown> | string
    STORAGE_SECRETS_JSON?: Record<string, unknown> | string
    IMAGE_PROXY_WATERMARK_SCHEMES_JSON?: Record<string, unknown> | string
    REFERER_ALLOWLIST?: string[] | string
    REFERER_POLICY_ALLOWLIST?: string
    REFERER_POLICY_NO_REFERER?: string
    REFERER_POLICY_OTHER?: string
  }
}
