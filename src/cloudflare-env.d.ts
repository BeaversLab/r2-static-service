declare namespace Cloudflare {
  interface Env {
    UPLOAD_BEARER_TOKEN: string
    TOKEN_SECRET: string
    REFERER_ALLOWLIST?: string[] | string
    REFERER_POLICY_ALLOWLIST?: string
    REFERER_POLICY_NO_REFERER?: string
    REFERER_POLICY_OTHER?: string
    WATERMARK_SCHEMES_JSON?: Record<string, unknown> | string
  }
}
