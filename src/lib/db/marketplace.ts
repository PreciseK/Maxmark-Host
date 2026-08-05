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
  has_download_asset: boolean
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
    // download_asset_path (the raw R2 key) is deliberately excluded from
    // fetchPlugins' select() so the customer-facing response never carries
    // it — has_download_asset is a server-computed boolean column instead
    // (see migrations/006_marketplace_asset_flag.sql). A determined caller
    // could still request download_asset_path directly via PostgREST (RLS
    // is row-level, not column-level); closing that fully needs a Postgres
    // column-grant restriction or a customer-safe view — not done here
    // because Fix 1 (encodeKeyPath hardening in supabase/functions/_shared
    // /r2.ts) already removes any way to turn a known key into a working
    // presigned URL without passing a real ownership/purchase check, which
    // is this codebase's actual authorization boundary.
    hasDownloadAsset: row.has_download_asset,
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
    // download_asset_path (the raw R2 key) is deliberately excluded here —
    // has_download_asset (a server-computed boolean) is selected instead.
    // See the comment on hasDownloadAsset in the mapper below.
    .select(
      'id, slug, name, tagline, description, category, product_type, tier, version, requires_wordpress, requires_php, price_ngn, featured, rating, installs_label, gradient, highlights, status, has_download_asset, created_at, updated_at',
    )
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
