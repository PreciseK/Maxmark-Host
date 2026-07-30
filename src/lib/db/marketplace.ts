import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MarketplacePlugin,
  MarketplaceTier,
  PluginCategory,
  PluginPurchase,
  PluginPurchaseStatus,
  ProductType,
  PurchaseAcquisition,
} from '@/types/marketplace'

interface DbPluginRow {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  product_type: string
  tier: number
  version: string
  requires_wordpress: string
  requires_php: string
  price_ngn: number
  featured: boolean
  rating: number
  installs_label: string
  gradient: string
  highlights: string[]
  status: string
  download_asset_path: string | null
}

interface DbPurchaseRow {
  id: string
  user_id: string
  plugin_id: string
  license_key: string
  amount_paid_ngn: number
  acquisition: string
  download_count: number
  last_downloaded_at: string | null
  status: string
  created_at: string
  updated_at: string
}

function mapDbPluginToMarketplacePlugin(row: DbPluginRow): MarketplacePlugin {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category as PluginCategory,
    productType: row.product_type as ProductType,
    tier: row.tier as MarketplaceTier,
    version: row.version,
    requiresWordPress: row.requires_wordpress,
    requiresPhp: row.requires_php,
    priceNgn: Number(row.price_ngn),
    featured: row.featured,
    rating: Number(row.rating),
    installsLabel: row.installs_label,
    gradient: row.gradient,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    hasDownloadAsset: row.download_asset_path !== null,
  }
}

export function mapDbPurchaseToPluginPurchase(row: DbPurchaseRow): PluginPurchase {
  return {
    id: row.id,
    userId: row.user_id,
    pluginId: row.plugin_id,
    licenseKey: row.license_key,
    amountPaidNgn: Number(row.amount_paid_ngn),
    acquisition: row.acquisition as PurchaseAcquisition,
    downloadCount: row.download_count,
    lastDownloadedAt: row.last_downloaded_at,
    status: row.status as PluginPurchaseStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchPlugins(supabase: SupabaseClient): Promise<MarketplacePlugin[]> {
  const { data, error } = await supabase
    .from('marketplace_plugins')
    .select('*')
    .eq('status', 'active')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data as DbPluginRow[]).map(mapDbPluginToMarketplacePlugin)
}

export async function fetchPurchases(supabase: SupabaseClient): Promise<PluginPurchase[]> {
  const { data, error } = await supabase
    .from('plugin_purchases')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as DbPurchaseRow[]).map(mapDbPurchaseToPluginPurchase)
}

// Licence rows are created server-side by the verify-payment Edge Function.
// The client is only allowed to update download bookkeeping on rows it owns
// (RLS: update-own policy; there is intentionally no client insert policy).
export async function updatePurchaseDownloadState(
  supabase: SupabaseClient,
  purchase: PluginPurchase,
): Promise<PluginPurchase | null> {
  const { data, error } = await supabase
    .from('plugin_purchases')
    .update({
      download_count: purchase.downloadCount,
      last_downloaded_at: purchase.lastDownloadedAt,
    })
    .eq('id', purchase.id)
    .select()
    .maybeSingle()

  if (error) throw error
  return data ? mapDbPurchaseToPluginPurchase(data as DbPurchaseRow) : null
}
