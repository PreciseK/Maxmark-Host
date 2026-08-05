import { lazy, Suspense, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ConfigurationError } from '@/components/configuration-error'
import { CustomerRoute } from '@/components/customer-route'
import { initialPluginPurchases, marketplacePlugins } from '@/data/mockMarketplace'
import { mockSites } from '@/data/mockSites'
import { fetchSites } from '@/lib/db/sites'
import { fetchPlugins, fetchPurchases } from '@/lib/db/marketplace'
import { configurationError, isDemoMode, supabase } from '@/lib/supabase'
import { SessionProvider } from '@/lib/session-context'
import { DashboardShell } from '@/layouts/dashboard-shell'
import type { PluginPurchase } from '@/types/marketplace'
import type { ManagedSite } from '@/types/provisioning'

const lazyPage = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) => lazy(() => loader().then((module) => ({ default: module[name] as ComponentType })))

const DashboardHome = lazyPage(() => import('@/pages/dashboard-home'), 'DashboardHome')
const PlansPage = lazyPage(() => import('@/pages/plans-page'), 'PlansPage')
const DomainsPage = lazyPage(() => import('@/pages/domains-page'), 'DomainsPage')
const DnsZonesPage = lazyPage(() => import('@/pages/dns-zones-page'), 'DnsZonesPage')
const SupportPage = lazyPage(() => import('@/pages/support-page'), 'SupportPage')
const BillingPage = lazyPage(() => import('@/pages/billing-page'), 'BillingPage')
const MarketplacePage = lazy(() => import('@/pages/marketplace-page').then((m) => ({ default: m.MarketplacePage })))
const SiteDetailPage = lazy(() => import('@/pages/site-detail-page').then((m) => ({ default: m.SiteDetailPage })))
const SslPage = lazyPage(() => import('@/pages/ssl-page'), 'SslPage')
const SitesPage = lazy(() => import('@/pages/sites-page').then((m) => ({ default: m.SitesPage })))
const LegalPage = lazyPage(() => import('@/pages/legal-page'), 'LegalPage')

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
  const [sites, setSites] = useState<ManagedSite[]>(isDemoMode ? mockSites : [])
  const [plugins, setPlugins] = useState(isDemoMode ? marketplacePlugins : [])
  const [pluginPurchases, setPluginPurchases] = useState<PluginPurchase[]>(
    isDemoMode ? initialPluginPurchases : [],
  )
  const [dataError, setDataError] = useState<string | null>(null)

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
        setSites(liveSites)
        setPlugins(livePlugins)
        setPluginPurchases(livePurchases)
        setDataError(null)
      } catch (error) {
        console.error('Live account data fetch failed:', error)
        setSites([])
        setPlugins([])
        setPluginPurchases([])
        setDataError('Your account data could not be loaded. Refresh to retry; no demo data has been substituted.')
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
        setSites([])
        setPlugins([])
        setPluginPurchases([])
        setDataError(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function handleSiteCreated(site: ManagedSite) {
    setSites((prev) => [site, ...prev])
  }

  function handlePluginPurchaseUpsert(purchase: PluginPurchase) {
    setPluginPurchases((prev) => {
      const exists = prev.some((p) => p.id === purchase.id)
      return exists
        ? prev.map((p) => (p.id === purchase.id ? purchase : p))
        : [purchase, ...prev]
    })

  }

  if (configurationError) return <ConfigurationError message={configurationError} />

  return (
    <BrowserRouter>
      <SessionProvider>
        {dataError ? (
          <div
            className="fixed inset-x-4 top-4 z-[100] rounded-md border border-amber-500/40 bg-[#251d0d] px-4 py-3 text-sm text-amber-100 shadow-xl"
            role="alert"
          >
            {dataError}
          </div>
        ) : null}
        <Suspense fallback={<div className="min-h-screen bg-[#121214]" />}>
        <Routes>
        <Route
          element={
            <CustomerRoute>
              <DashboardShell />
            </CustomerRoute>
          }
          path="/"
        >
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
        <Route element={<LegalPage />} path="/legal/:policy" />
        <Route
          element={
            <Suspense fallback={<div className="min-h-screen bg-[#121214]" />}>
              <AdminArea />
            </Suspense>
          }
          path="/admin/*"
        />
        </Routes>
        </Suspense>
      </SessionProvider>
    </BrowserRouter>
  )
}

export default App
