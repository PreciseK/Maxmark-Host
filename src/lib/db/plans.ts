import type { SupabaseClient } from '@supabase/supabase-js'

export interface HostingPlan {
  id: string
  name: string
  type: 'VIP' | 'Standard' | 'Scale' | 'Launch'
  region: string
  sitesLimit: number
  appEnvironment: string
  priceNgnYearly: number
  renewalDate: string
  status: 'active' | 'cancelled' | 'suspended'
  createdAt: string
}

export async function fetchPlans(supabase: SupabaseClient): Promise<HostingPlan[]> {
  const { data, error } = await supabase
    .from('hosting_plans')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as HostingPlan['type'],
    region: r.region as string,
    sitesLimit: r.sites_limit as number,
    appEnvironment: r.app_environment as string,
    priceNgnYearly: Number(r.price_ngn_yearly),
    renewalDate: r.renewal_date as string,
    status: r.status as HostingPlan['status'],
    createdAt: r.created_at as string,
  }))
}
