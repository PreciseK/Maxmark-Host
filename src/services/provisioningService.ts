// Front door for site provisioning.
//
// Live mode (Supabase configured + signed-in session): calls the
// provision-site Edge Function, which runs the real WHM pipeline server-side.
// Demo mode: falls back to the browser simulation so the product remains
// fully demoable without credentials.

import { fetchSites } from '@/lib/db/sites'
import { provisionSiteViaFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import type { DbType, ManagedSite, ProvisioningStep, SiteType } from '@/types/provisioning'

export interface ProvisionSiteOptions {
  existingDomains: string[]
  siteType?: SiteType
  database?: DbType
  onProgress?: (steps: ProvisioningStep[]) => void
}

function defaultStepsForType(siteType: SiteType, database: DbType = 'none'): ProvisioningStep[] {
  const base: ProvisioningStep[] = [
    { id: 'select-node', label: 'Validating Domain Input', description: 'Checking domain format and availability', state: 'pending' },
    { id: 'create-domain', label: 'Allocating Node & Slot', description: 'Selecting optimal server node and creating domain root', state: 'pending' },
  ]

  if (siteType === 'wordpress' || database === 'mysql') {
    base.push(
      { id: 'create-database', label: 'Creating MySQL Database', description: 'Configuring WHM account and MySQL credentials', state: 'pending' },
    )
    if (siteType === 'wordpress') {
      base.push(
        { id: 'install-wordpress', label: 'Installing WordPress Core', description: 'Deploying latest WordPress release', state: 'pending' },
      )
    }
  } else if (database === 'postgresql') {
    base.push(
      { id: 'create-database', label: 'Creating PostgreSQL Database', description: 'Configuring WHM account and PostgreSQL credentials', state: 'pending' },
    )
  }

  if (siteType === 'nextjs' || siteType === 'nodejs') {
    base.push(
      { id: 'setup-nodejs-app', label: 'Configuring Node.js Runtime', description: 'Setting up Node.js App Manager on the cPanel account', state: 'pending' },
    )
  }
  // 'static' — no additional infra steps

  base.push(
    { id: 'enable-ssl', label: 'Enabling AutoSSL', description: 'Requesting certificate validation through cPanel AutoSSL', state: 'pending' },
    { id: 'complete', label: 'Finalizing Provisioning', description: 'Recording site record and verifying configuration', state: 'pending' },
  )

  return base
}

export async function provisionSite(
  domainInput: string,
  options: ProvisionSiteOptions,
): Promise<ManagedSite> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }

  const sb = supabase
  const {
    data: { session },
  } = await sb.auth.getSession()

  if (!session) {
    throw new Error('You must be logged in to provision a site.')
  }

  const siteType = options.siteType ?? 'wordpress'
  const database = options.database ?? (siteType === 'wordpress' ? 'mysql' : 'none')
  const steps = defaultStepsForType(siteType, database)
  options.onProgress?.(
    steps.map((step, index) =>
      index === 0 ? { ...step, state: 'in_progress' } : step,
    ),
  )

  const result = await provisionSiteViaFunction(sb, domainInput, siteType, database)
  options.onProgress?.(result.steps)

  // Re-read through the repository so the new row is mapped with all its
  // display fields (plan, region, metrics) coming from DB defaults.
  const sites = await fetchSites(sb)
  const managed = sites.find((site) => site.id === result.site.id)

  if (!managed) {
    throw new Error(
      'Site was provisioned but could not be reloaded. Refresh the page.',
    )
  }

  return managed
}
