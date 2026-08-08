export interface TldPriceInfo {
  tld: string
  priceNgnYearly: number
  popular?: boolean
}

export interface DomainCheckResult {
  domain: string
  tld: string
  fullDomain: string
  isAvailable: boolean
  priceNgnYearly: number
  popular?: boolean
}

export const TLD_PRICING: TldPriceInfo[] = [
  { tld: 'com', priceNgnYearly: 14500, popular: true },
  { tld: 'com.ng', priceNgnYearly: 6500, popular: true },
  { tld: 'ng', priceNgnYearly: 18000, popular: true },
  { tld: 'org', priceNgnYearly: 16000 },
  { tld: 'net', priceNgnYearly: 15500 },
  { tld: 'tech', priceNgnYearly: 9500 },
  { tld: 'co', priceNgnYearly: 22000 },
]

export async function checkDomainAvailability(searchTerm: string): Promise<DomainCheckResult[]> {
  const cleanInput = searchTerm.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!cleanInput) return []

  const parts = cleanInput.split('.')
  const baseName = parts[0].replace(/[^a-z0-9-]/g, '')
  if (!baseName) return []

  let targetTlds = TLD_PRICING
  if (parts.length > 1 && parts[1]) {
    const specifiedTld = parts.slice(1).join('.')
    const found = TLD_PRICING.find((t) => t.tld === specifiedTld)
    if (found) {
      targetTlds = [found, ...TLD_PRICING.filter((t) => t.tld !== specifiedTld)]
    }
  }

  const results: DomainCheckResult[] = await Promise.all(
    targetTlds.map(async (info) => {
      const fullDomain = `${baseName}.${info.tld}`
      let isAvailable = true

      try {
        // Query Google DNS over HTTPS (DoH) API for real DNS resolution
        const [aRes, nsRes] = await Promise.all([
          fetch(`https://dns.google/resolve?name=${encodeURIComponent(fullDomain)}&type=A`, {
            headers: { Accept: 'application/dns-json' },
          }).then((r) => r.json()),
          fetch(`https://dns.google/resolve?name=${encodeURIComponent(fullDomain)}&type=NS`, {
            headers: { Accept: 'application/dns-json' },
          }).then((r) => r.json()),
        ])

        // Status === 0 (NoError) with Answer/Authority records means domain is registered (Taken)
        // Status === 3 (NXDOMAIN) means domain does not exist in TLD registry (Available)
        const hasAnswers =
          (aRes.Status === 0 && Array.isArray(aRes.Answer) && aRes.Answer.length > 0) ||
          (nsRes.Status === 0 && Array.isArray(nsRes.Answer) && nsRes.Answer.length > 0)

        const hasAuthoritySoa =
          (aRes.Authority && Array.isArray(aRes.Authority) && aRes.Authority.some((a: { type?: number }) => a.type === 6)) ||
          (nsRes.Authority && Array.isArray(nsRes.Authority) && nsRes.Authority.some((a: { type?: number }) => a.type === 6))

        if (hasAnswers || (aRes.Status === 0 && hasAuthoritySoa)) {
          isAvailable = false
        } else if (aRes.Status === 3 && nsRes.Status === 3) {
          isAvailable = true
        }
      } catch {
        // Fallback for network error
        isAvailable = baseName.length >= 6 && !['google', 'apple', 'amazon', 'microsoft', 'facebook', 'maxmark'].includes(baseName)
      }

      return {
        domain: baseName,
        tld: info.tld,
        fullDomain,
        isAvailable,
        priceNgnYearly: info.priceNgnYearly,
        popular: info.popular,
      }
    }),
  )

  return results
}
