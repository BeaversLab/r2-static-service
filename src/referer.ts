import type { AppConfig, PolicyAction, RefererCategory } from './types.ts'

const extractHostname = (value: string) => {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const matchesAllowlistEntry = (hostname: string, rule: string) => {
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(2)
    return hostname === suffix || hostname.endsWith(`.${suffix}`)
  }
  return hostname === rule || hostname === extractHostname(rule)
}

export const resolveRefererCategory = (
  refererHeader: string | undefined,
  allowlist: string[]
): RefererCategory => {
  if (!refererHeader) return 'no-referer'
  const hostname = extractHostname(refererHeader)
  if (!hostname) return 'other'
  return allowlist.some((rule) => matchesAllowlistEntry(hostname, rule)) ? 'allowlist' : 'other'
}

export const resolvePolicyAction = (config: AppConfig, refererHeader: string | undefined): PolicyAction => {
  const category = resolveRefererCategory(refererHeader, config.refererAllowlist)
  return config.refererPolicies[category]
}
