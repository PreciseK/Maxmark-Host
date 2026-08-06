import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  HelpCircle,
  Plus,
  Search,
  Server,
} from 'lucide-react'

import { fetchBillingData, type BillingData } from '@/lib/db/billing'
import { fetchPublishedArticles, type KbArticle } from '@/lib/db/kb'
import {
  MAINTENANCE_STATE_LABELS,
  deriveWindowState,
  fetchActiveMaintenanceWindows,
  type MaintenanceState,
  type MaintenanceWindow,
} from '@/lib/db/maintenance'
import {
  SERVICE_STATUS_LABELS,
  fetchServiceComponents,
  overallStatus,
  type ServiceComponent,
  type ServiceStatus,
} from '@/lib/db/service-status'
import { fetchSites } from '@/lib/db/sites'
import { fetchConversations } from '@/lib/db/support'
import { supabase } from '@/lib/supabase'
import type { ManagedSite } from '@/types/provisioning'
import {
  EmptyState,
  ErrorState,
  NoSearchResultState,
  StatsSkeleton,
  CardSkeleton,
} from '@/components/ui/ui-states'

const STATUS_DOT: Record<ServiceStatus, string> = {
  operational: 'bg-emerald-500',
  maintenance: 'bg-sky-500',
  degraded: 'bg-amber-500',
  partial_outage: 'bg-orange-500',
  major_outage: 'bg-red-500',
}

const STATUS_BANNER: Record<ServiceStatus, string> = {
  operational: 'text-emerald-500',
  maintenance: 'text-sky-400',
  degraded: 'text-amber-400',
  partial_outage: 'text-orange-400',
  major_outage: 'text-red-400',
}

// Reusable Status Widget Component
export function StatusWidget() {
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [components, setComponents] = useState<ServiceComponent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase) {
        setLoading(false)
        return
      }
      try {
        const rows = await fetchServiceComponents(supabase)
        if (!cancelled) setComponents(rows)
      } catch (error) {
        console.warn('Service status fetch failed:', error)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id)
  }

  const overall = overallStatus(components)
  const bannerLabel =
    overall === 'operational' ? 'All Systems Operational' : SERVICE_STATUS_LABELS[overall]

  return (
    <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Status</h3>
        <Link aria-label="Open support" className="text-[#5c4df0] hover:text-[#796ef3]" to="/support">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading status…</p>
      ) : loadError ? (
        <p className="text-xs text-red-400">Status could not be loaded.</p>
      ) : components.length === 0 ? (
        <p className="text-xs text-muted-foreground">No service components are being tracked.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-[#121214] border border-[#232328] rounded-md p-3">
            {overall === 'operational' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[overall]}`} />
            )}
            <span className={`text-xs font-medium ${STATUS_BANNER[overall]}`}>{bannerLabel}</span>
          </div>

          <div className="divide-y divide-[#232328]">
            {components.map((component) => {
              const isOpen = openSection === component.id
              return (
                <div className="py-2.5 first:pt-0 last:pb-0" key={component.id}>
                  <button
                    className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-white transition-colors py-1"
                    onClick={() => toggleSection(component.id)}
                  >
                    <span>{component.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[component.status]}`} />
                      {isOpen ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="mt-2 pl-2 text-[11px] text-muted-foreground bg-[#121214] p-2 rounded border border-[#232328]">
                      <span className="block font-semibold text-white/80">
                        {SERVICE_STATUS_LABELS[component.status]}
                      </span>
                      {component.description}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

const MAINTENANCE_TONE: Record<MaintenanceState, string> = {
  scheduled: 'text-amber-500',
  in_progress: 'text-sky-400',
  completed: 'text-emerald-500',
}

const windowFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

// Reusable Scheduled Maintenance Component
export function ScheduledMaintenanceWidget() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase) {
        setLoading(false)
        return
      }
      try {
        const rows = await fetchActiveMaintenanceWindows(supabase)
        if (!cancelled) setWindows(rows)
      } catch (error) {
        console.warn('Maintenance window fetch failed:', error)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const now = new Date()

  return (
    <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Scheduled Maintenance</h3>
        <Link aria-label="Open maintenance support" className="text-[#5c4df0] hover:text-[#796ef3]" to="/support">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading maintenance…</p>
      ) : loadError ? (
        <p className="text-xs text-red-400">Maintenance schedule could not be loaded.</p>
      ) : windows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No maintenance is scheduled.</p>
      ) : (
        <div className="space-y-3">
          {windows.map((item) => {
            const state = deriveWindowState(item, now)
            return (
              <div className="p-3 bg-[#121214] border border-[#232328] rounded-md" key={item.id}>
                <span className="text-xs font-semibold text-white">{item.title}</span>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  <span
                    className={`font-semibold uppercase tracking-wider text-[9px] block mb-1 ${MAINTENANCE_TONE[state]}`}
                  >
                    {MAINTENANCE_STATE_LABELS[state]}
                  </span>
                  {item.body}
                </p>
                <div className="text-[10px] text-muted-foreground/80 mt-3 pt-2 border-t border-[#232328]">
                  {windowFmt.format(new Date(item.startsAt))} — {windowFmt.format(new Date(item.endsAt))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** How many articles the home widget lists before sending people to /kb. */
const HOME_ARTICLE_LIMIT = 5

export function DashboardHome() {
  const [sites, setSites] = useState<ManagedSite[]>([])
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [activeCasesCount, setActiveCasesCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [articles, setArticles] = useState<KbArticle[]>([])

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [hasSearched, setHasSearched] = useState<boolean>(false)

  async function loadDashboardData() {
    if (!supabase) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      const [fetchedSites, fetchedBilling, fetchedConvs] = await Promise.all([
        fetchSites(sb),
        fetchBillingData(sb),
        fetchConversations(sb),
      ])
      setSites(fetchedSites)
      setBilling(fetchedBilling)
      setActiveCasesCount(fetchedConvs.filter(c => c.status === 'open').length)
    } catch (err) {
      console.error('Failed to load dashboard home data:', err)
      setError(err instanceof Error ? err.message : 'Unable to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboardData()
  }, [])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    fetchPublishedArticles(supabase)
      .then((rows) => {
        if (!cancelled) setArticles(rows)
      })
      .catch((error: unknown) => {
        console.warn('Knowledge base fetch failed:', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const primarySite = sites[0] ?? null
  const unpaidInvoices = billing?.invoices.filter((i) => i.status === 'unpaid') ?? []
  const totalUnpaidNgn = unpaidInvoices.reduce((acc, i) => acc + i.totalNgn, 0)
  const fmtNgn = (n: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)

  const searchTerm = searchQuery.trim().toLowerCase()
  // With no search, show a curated head of the list; searching covers them all.
  const filteredArticles = searchTerm
    ? articles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchTerm) ||
          article.category.toLowerCase().includes(searchTerm),
      )
    : articles.slice(0, HOME_ARTICLE_LIMIT)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Home</h1>
      </div>

      {error ? (
        <ErrorState
          title="Failed to load dashboard data"
          message="We encountered an issue fetching your sites and billing summary."
          error={error}
          onRetry={() => void loadDashboardData()}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Main Dashboard Widget Cards */}
          {loading ? (
            <StatsSkeleton count={3} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Support */}
              <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col justify-between h-[140px]">
                <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  <span className="flex items-center gap-1">
                    Support
                    <Link className="hover:text-white" to="/support">
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  </span>
                  <Link className="text-[#5c4df0] hover:text-[#796ef3]" to="/support">
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-2">
                  <div className="text-4xl font-semibold text-white">{activeCasesCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Active Cases</div>
                </div>
              </div>

              {/* Invoices */}
              <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col justify-between h-[140px]">
                <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  <span>Invoices</span>
                  <Link className="text-[#5c4df0] hover:text-[#796ef3]" to="/billing">
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-2">
                  <div className="flex items-baseline gap-2">
                    {totalUnpaidNgn > 0 ? (
                      <span className="text-xs text-amber-500 font-semibold uppercase bg-amber-500/10 px-1.5 py-0.5 rounded">
                        Unpaid
                      </span>
                    ) : null}
                    <span className="text-3xl font-semibold text-white">{fmtNgn(totalUnpaidNgn)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Total Amount Due: {fmtNgn(totalUnpaidNgn)}
                  </div>
                </div>
              </div>

              {/* Credits */}
              <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col justify-between h-[140px]">
                <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  <span>Credits</span>
                  <Link className="text-[#5c4df0] hover:text-[#796ef3]" to="/billing">
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-2">
                  <div className="text-4xl font-semibold text-white">{fmtNgn(billing?.creditBalance ?? 0)}</div>
                  <div className="text-xs text-muted-foreground mt-1">&nbsp;</div>
                </div>
              </div>
            </div>
          )}

          {/* Quick WordPress Access Card */}
          {loading ? (
            <CardSkeleton />
          ) : primarySite ? (
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-[#0073aa] flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-white font-serif">W</span>
                </div>
                <div className="flex-1 space-y-1">
                  <Link
                    className="text-lg font-semibold text-white underline hover:text-[#5c4df0] transition-colors"
                    to={`/sites/${primarySite.id}`}
                  >
                    {primarySite.site_domain}
                  </Link>
                  <div className="text-xs text-muted-foreground">{primarySite.plan}</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-2 text-xs">
                <div className="bg-[#121214] border border-[#232328] rounded p-3 flex justify-between items-center">
                  <span className="text-muted-foreground">Username</span>
                  <span className="font-semibold text-white font-mono">{primarySite.db_user}</span>
                </div>
                <div className="bg-[#121214] border border-[#232328] rounded p-3 flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold">
                    {primarySite.status}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Link
                  className="flex-1 text-center py-2.5 bg-[#202024] hover:bg-[#2c2c32] rounded-md border border-[#2d2d34] text-xs font-semibold transition text-white"
                  to={`/sites/${primarySite.id}`}
                >
                  Site Dashboard
                </Link>
                <button
                  className="flex-1 py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition"
                  onClick={() => window.open(`https://${primarySite.site_domain}/wp-admin`, '_blank', 'noopener,noreferrer')}
                  type="button"
                >
                  Enter WordPress
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              badge="Getting Started"
              icon={<Server className="h-7 w-7 text-violet-400" />}
              title="No WordPress Sites Provisioned"
              description="Deploy high-performance, managed WordPress hosting on cPanel infrastructure in seconds."
              actionLabel="Provision Your First Site"
              actionLink="/sites"
            />
          )}

          {/* Search Knowledge Base Card */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Search our Knowledge Base
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </h3>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setHasSearched(true)
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search articles, guides, and documentation…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setHasSearched(false)
                  }}
                  className="w-full bg-[#121214] border border-[#232328] rounded-md pl-9 pr-4 py-2 text-sm text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/55"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-sm font-medium text-white border border-[#2d2d34] transition"
              >
                Search
              </button>
            </form>

            {hasSearched || searchQuery.trim().length > 0 ? (
              filteredArticles.length > 0 ? (
                <div className="divide-y divide-[#232328] rounded-md border border-[#232328] bg-[#121214] p-3">
                  {filteredArticles.map((article) => (
                    <div className="py-2.5 first:pt-0 last:pb-0" key={article.id}>
                      <Link to={`/kb/${article.slug}`} className="text-xs font-semibold text-white hover:text-violet-300">
                        {article.title}
                      </Link>
                      <span className="ml-2 inline-block rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/50">
                        {article.category}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <NoSearchResultState
                  searchQuery={searchQuery}
                  onClearSearch={() => {
                    setSearchQuery('')
                    setHasSearched(false)
                  }}
                />
              )
            ) : null}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Performance Shield Widget */}
          <div className="bg-[#1C1C30] border border-[#2F2F52] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Performance Shield</h3>
            <p className="text-xs text-[#d1d1f0] leading-relaxed">
              Get Cloudflare's speed and security without leaving the Maxmark platform.
            </p>
            <p className="text-xs text-[#d1d1f0] leading-relaxed">
              Performance Shield prioritizes your network delivery and takes action when a threat is
              detected. To activate, go to the **Content Delivery** section under any of your Plan's
              Sites.
            </p>
          </div>

          {/* Status Widget */}
          <StatusWidget />

          {/* Scheduled Maintenance Widget */}
          <ScheduledMaintenanceWidget />
        </div>
      </div>
    </div>
  )
}
