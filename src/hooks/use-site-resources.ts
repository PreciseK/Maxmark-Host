import { useCallback, useEffect, useState } from 'react'

import { fetchAnalyticsSnapshots, type AnalyticsSnapshot } from '@/lib/db/analytics'
import { fetchContainerServices, type ContainerService } from '@/lib/db/containers'
import { fetchCronTasks, type CronTask } from '@/lib/db/cron'
import { fetchEmailAliases, fetchEmailBoxes, type EmailAlias, type EmailBox } from '@/lib/db/email'
import { fetchIntegrations, type Integration } from '@/lib/db/integrations'
import { fetchPointerDomains, type PointerDomain } from '@/lib/db/pointer-domains'
import { fetchSiteSettings, type SiteSettings } from '@/lib/db/site-settings'
import { fetchSiteSslCertificate, type SslCertificate } from '@/lib/db/ssl'
import { fetchStagingEnvironments, type StagingEnvironment } from '@/lib/db/staging'
import { supabase } from '@/lib/supabase'

export interface SiteResources {
  ssl: SslCertificate | null
  staging: StagingEnvironment[]
  emailBoxes: EmailBox[]
  emailAliases: EmailAlias[]
  cronTasks: CronTask[]
  containers: ContainerService[]
  integrations: Integration[]
  analytics: AnalyticsSnapshot[]
  settings: SiteSettings | null
  pointerDomains: PointerDomain[]
}

const EMPTY_RESOURCES: SiteResources = {
  ssl: null,
  staging: [],
  emailBoxes: [],
  emailAliases: [],
  cronTasks: [],
  containers: [],
  integrations: [],
  analytics: [],
  settings: null,
  pointerDomains: [],
}

/**
 * Which tabs read which resources. Tabs absent from this map render only
 * fields already present on the site row, so they need no extra query.
 */
const TAB_RESOURCES: Record<string, (keyof SiteResources)[]> = {
  staging: ['staging'],
  domains: ['pointerDomains'],
  email: ['emailBoxes', 'emailAliases', 'settings'],
  ssl: ['ssl', 'settings'],
  analytics: ['analytics'],
  tasks: ['cronTasks', 'settings'],
  containers: ['containers'],
  integrations: ['integrations'],
  management: ['settings'],
}

/**
 * Loads only what the active tab needs, once per (site, tab). Switching back
 * to an already-loaded tab does not refetch; changing site clears everything.
 */
export function useSiteResources(siteId: string | undefined, activeTab: string) {
  const [resources, setResources] = useState<SiteResources>(EMPTY_RESOURCES)
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A new site invalidates everything fetched for the previous one.
  useEffect(() => {
    setResources(EMPTY_RESOURCES)
    setLoadedKeys(new Set())
    setError(null)
  }, [siteId])

  const load = useCallback(
    async (needed: (keyof SiteResources)[], sb: NonNullable<typeof supabase>, id: string) => {
      setLoading(true)
      setError(null)
      try {
        const updates: Partial<SiteResources> = {}
        await Promise.all(
          needed.map(async (key) => {
            switch (key) {
              case 'ssl':
                updates.ssl = await fetchSiteSslCertificate(sb, id)
                break
              case 'staging':
                updates.staging = await fetchStagingEnvironments(sb, id)
                break
              case 'emailBoxes':
                updates.emailBoxes = await fetchEmailBoxes(sb, id)
                break
              case 'emailAliases':
                updates.emailAliases = await fetchEmailAliases(sb, id)
                break
              case 'cronTasks':
                updates.cronTasks = await fetchCronTasks(sb, id)
                break
              case 'containers':
                updates.containers = await fetchContainerServices(sb, id)
                break
              case 'integrations':
                updates.integrations = await fetchIntegrations(sb, id)
                break
              case 'analytics':
                updates.analytics = await fetchAnalyticsSnapshots(sb, id)
                break
              case 'settings':
                updates.settings = await fetchSiteSettings(sb, id)
                break
              case 'pointerDomains':
                updates.pointerDomains = await fetchPointerDomains(sb, id)
                break
            }
          }),
        )
        setResources((prev) => ({ ...prev, ...updates }))
        setLoadedKeys((prev) => new Set([...prev, ...needed.map((k) => `${id}:${k}`)]))
      } catch (err) {
        console.error('Site resource fetch failed:', err)
        setError(err instanceof Error ? err.message : 'This section could not be loaded.')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!supabase || !siteId) return
    const needed = (TAB_RESOURCES[activeTab] ?? []).filter(
      (key) => !loadedKeys.has(`${siteId}:${key}`),
    )
    if (needed.length === 0) return
    void load(needed, supabase, siteId)
    // loadedKeys is intentionally omitted: it updates inside load() and
    // re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, activeTab, load])

  const retry = useCallback(() => {
    if (!supabase || !siteId) return
    const needed = TAB_RESOURCES[activeTab] ?? []
    if (needed.length === 0) return
    void load(needed, supabase, siteId)
  }, [siteId, activeTab, load])

  return { resources, loading, error, retry }
}
