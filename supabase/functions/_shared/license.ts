// Licence key generation — shared by verify-payment (paid purchases) and
// claim-item (subscription entitlements). Keys are only ever minted
// server-side.

export function generateLicenseKey(slug: string): string {
  const base = slug.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 10)
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  const random = Array.from(bytes, (b) =>
    (b % 36).toString(36).toUpperCase(),
  ).join('')
  const parts = [random.slice(0, 3), random.slice(3, 6), random.slice(6, 9)]
  return ['MM', base || 'ITEM', ...parts].join('-')
}
