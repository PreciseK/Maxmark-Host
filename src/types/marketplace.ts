export type PluginCategory =
  | 'Performance'
  | 'Commerce'
  | 'Growth'
  | 'Security'

export type ProductType = 'plugin' | 'theme'

/** 1–3. Items at or below the user's subscription tier are included. */
export type MarketplaceTier = 1 | 2 | 3

export interface MarketplacePlugin {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: PluginCategory
  productType: ProductType
  tier: MarketplaceTier
  version: string
  requiresWordPress: string
  requiresPhp: string
  priceNgn: number
  featured: boolean
  rating: number
  installsLabel: string
  gradient: string
  highlights: string[]
  hasDownloadAsset: boolean
}

export type PluginPurchaseStatus = 'active' | 'refunded' | 'revoked'

/** How the licence was obtained: paid individually or included in the tier. */
export type PurchaseAcquisition = 'purchase' | 'subscription'

export interface PluginPurchase {
  id: string
  userId: string
  pluginId: string
  licenseKey: string
  amountPaidNgn: number
  acquisition: PurchaseAcquisition
  createdAt: string
  updatedAt: string
  lastDownloadedAt: string | null
  downloadCount: number
  status: PluginPurchaseStatus
}
