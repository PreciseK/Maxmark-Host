// Front door for site provisioning.
//
// Live mode (Supabase configured + signed-in session): calls the
// provision-site Edge Function, which runs the real WHM pipeline server-side.
// Demo mode: falls back to the browser simulation so the product remains
// fully demoable without credentials.

import { fetchSites } from '@/lib/db/sites'
import { provisionSiteViaFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import { createProvisioningSteps } from '@/data/mockSites'
import { simulateProvisionSite } from '@/services/mockProvisioningClient'
import type { ManagedSite, ProvisioningStep } from '@/types/provisioning'

export interface ProvisionSiteOptions {
  existingDomains: string[]
  onProgress?: (steps: ProvisioningStep[]) => void
}

export async function provisionSite(
  domainInput: string,
  options: ProvisionSiteOptions,
): Promise<ManagedSite> {
  if (!supabase) {
    return simulateProvisionSite(domainInput, options)
  }

  const sb = supabase
  const {
    data: { session },
  } = await sb.auth.getSession()

  if (!session) {
    return simulateProvisionSite(domainInput, options)
  }

  // Live provisioning happens server-side in one call, so progress is
  // coarse: show the pipeline as started, then replay the server's step log.
  const steps = createProvisioningSteps()
  options.onProgress?.(
    steps.map((step, index) =>
      index === 0 ? { ...step, state: 'in_progress' } : step,
    ),
  )

  const result = await provisionSiteViaFunction(sb, domainInput)
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
