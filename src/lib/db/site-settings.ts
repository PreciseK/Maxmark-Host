import type { SupabaseClient } from '@supabase/supabase-js'

export interface SiteSettings {
  id: string
  siteId: string
  localMailDelivery: boolean
  coreUpgrades: boolean
  nginxAccelerator: boolean
  autoLetsEncrypt: boolean
  passwordProtection: boolean
  phpWorkers: number
  cronMailTo: string | null
}

/** site_id is unique on site_settings, so at most one row per site. */
export async function fetchSiteSettings(
  supabase: SupabaseClient,
  siteId: string,
): Promise<SiteSettings | null> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const r = data as Record<string, unknown>
  return {
    id: r.id as string,
    siteId: r.site_id as string,
    localMailDelivery: r.local_mail_delivery as boolean,
    coreUpgrades: r.core_upgrades as boolean,
    nginxAccelerator: r.nginx_accelerator as boolean,
    autoLetsEncrypt: r.auto_lets_encrypt as boolean,
    passwordProtection: r.password_protection as boolean,
    phpWorkers: r.php_workers as number,
    cronMailTo: (r.cron_mail_to as string | null) ?? null,
  }
}
