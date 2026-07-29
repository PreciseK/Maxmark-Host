import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { initialPluginPurchases, marketplacePlugins } from '@/data/mockMarketplace'
import { mockSites } from '@/data/mockSites'
import { fetchSites } from '@/lib/db/sites'
import {
  fetchPlugins,
  fetchPurchases,
  updatePurchaseDownloadState,
} from '@/lib/db/marketplace'
import { supabase } from '@/lib/supabase'
import { SessionProvider } from '@/lib/session-context'
import { DashboardShell } from '@/layouts/dashboard-shell'
import { DashboardHome } from '@/pages/dashboard-home'
import { PlansPage } from '@/pages/plans-page'
import { DomainsPage } from '@/pages/domains-page'
import { DnsZonesPage } from '@/pages/dns-zones-page'
import { SupportPage } from '@/pages/support-page'
import { BillingPage } from '@/pages/billing-page'
import { MarketplacePage } from '@/pages/marketplace-page'
import { SiteDetailPage } from '@/pages/site-detail-page'
import { SslPage } from '@/pages/ssl-page'
import { SitesPage } from '@/pages/sites-page'
import type { PluginPurchase } from '@/types/marketplace'
import type { ManagedSite } from '@/types/provisioning'

// The login page pulls in three.js / react-three-fiber for its shader
// background — lazy-load it so the dashboard bundle stays lean.
const LoginPage = lazy(() =>
  import('@/pages/login-page').then((m) => ({ default: m.LoginPage })),
)

// The admin console is lazy-loaded as one chunk so customer sessions never
// download it.
const AdminArea = lazy(() =>
  import('@/pages/admin/admin-area').then((m) => ({ default: m.AdminArea })),
)

function App() {
  const [sites, setSites] = useState<ManagedSite[]>(mockSites)
  const [plugins, setPlugins] = useState(marketplacePlugins)
  const [pluginPurchases, setPluginPurchases] = useState<PluginPurchase[]>(initialPluginPurchases)
  const [dbReady, setDbReady] = useState(false)

  // Load live data from Supabase whenever a session appears; drop back to
  // demo data on sign-out. Demo data also stays if a fetch fails, but the
  // failure is logged so it is diagnosable.
  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const [liveSites, livePlugins, livePurchases] = await Promise.all([
          fetchSites(sb),
          fetchPlugins(sb),
          fetchPurchases(sb),
        ])
        if (liveSites.length > 0) setSites(liveSites)
        if (livePlugins.length > 0) setPlugins(livePlugins)
        if (livePurchases.length > 0) setPluginPurchases(livePurchases)
        setDbReady(true)
      } catch (error) {
        console.warn('Live data fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        void loadLiveData()
      } else if (event === 'SIGNED_OUT') {
        setSites(mockSites)
        setPlugins(marketplacePlugins)
        setPluginPurchases(initialPluginPurchases)
        setDbReady(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function handleSiteCreated(site: ManagedSite) {
    setSites((prev) => [site, ...prev])
  }

  async function handlePluginPurchaseUpsert(purchase: PluginPurchase) {
    setPluginPurchases((prev) => {
      const exists = prev.some((p) => p.id === purchase.id)
      return exists
        ? prev.map((p) => (p.id === purchase.id ? purchase : p))
        : [purchase, ...prev]
    })

    // Sync download bookkeeping for real licences only; demo purchases have
    // no matching auth user and would be rejected by RLS anyway.
    if (supabase && dbReady && purchase.userId !== 'demo-user') {
      try {
        await updatePurchaseDownloadState(supabase, purchase)
      } catch (error) {
        console.warn('Purchase sync failed; local state kept:', error)
      }
    }
  }

  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
        <Route element={<DashboardShell />} path="/">
          <Route element={<Navigate replace to="/home" />} index />
          <Route element={<DashboardHome />} path="home" />
          <Route element={<PlansPage />} path="plans" />
          <Route element={<DomainsPage />} path="domains" />
          <Route element={<DnsZonesPage />} path="dns-zones" />
          <Route
            element={<SitesPage onSiteCreated={handleSiteCreated} sites={sites} />}
            path="sites"
          />
          <Route element={<SiteDetailPage sites={sites} />} path="sites/:siteId" />
          <Route
            element={
              <MarketplacePage
                plugins={plugins}
                purchases={pluginPurchases}
                sites={sites}
                onPurchaseUpsert={handlePluginPurchaseUpsert}
              />
            }
            path="marketplace"
          />
          <Route element={<BillingPage />} path="billing" />
          <Route element={<SupportPage />} path="support" />
          <Route element={<SslPage />} path="ssl" />
        </Route>
        <Route
          element={
            <Suspense fallback={<div className="min-h-screen bg-black" />}>
              <LoginPage />
            </Suspense>
          }
          path="/login"
        />
        <Route
          element={
            <Suspense fallback={<div className="min-h-screen bg-[#121214]" />}>
              <AdminArea />
            </Suspense>
          }
          path="/admin/*"
        />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}

export default App
