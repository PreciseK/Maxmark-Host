import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Globe,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react'

import { fetchRegisteredDomains, type RegisteredDomain } from '@/lib/db/domains'
import {
  checkDomainAvailability,
  TLD_PRICING,
  type DomainCheckResult,
} from '@/lib/domain-checker'
import { supabase } from '@/lib/supabase'
import { ActionDropdown } from '@/components/ui/dropdown-menu'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/ui-states'

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

function fmtPrice(ngn: number): string {
  return (
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(ngn) +
    ' / yr'
  )
}

function statusBadgeClass(status: RegisteredDomain['status']): string {
  switch (status) {
    case 'active': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    case 'expired': return 'border-red-500/30 bg-red-500/10 text-red-400'
    case 'pending': return 'border-sky-500/30 bg-sky-500/10 text-sky-400'
    case 'transferred': return 'border-purple-500/30 bg-purple-500/10 text-purple-400'
    default: return 'border-amber-500/30 bg-amber-500/10 text-amber-500'
  }
}

export function DomainsPage() {
  const [domains, setDomains] = useState<RegisteredDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'registration' | 'manage'>('registration')

  // Domain availability search state
  const [searchQuery, setSearchQuery] = useState('')
  const [checking, setChecking] = useState(false)
  const [searchResults, setSearchResults] = useState<DomainCheckResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  const loadDomains = async () => {
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
      const data = await fetchRegisteredDomains(sb)
      setDomains(data)
    } catch (err) {
      console.error('Domains fetch error:', err)
      setError(err instanceof Error ? err.message : 'Domains could not be loaded.')
      setDomains([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDomains()
  }, [])

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault()
    if (!searchQuery.trim() || checking) return

    setChecking(true)
    setHasSearched(true)
    try {
      const results = await checkDomainAvailability(searchQuery)
      setSearchResults(results)
    } catch (err) {
      console.error('Domain availability check error:', err)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-6 text-left">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span> <span className="text-white">Domains</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-4">Domains</h1>

        {/* Sub-Tabs */}
        <div className="flex border-b border-[#232328] gap-6 text-sm font-semibold select-none pb-0.5">
          <button
            className={`pb-2 transition duration-150 ${
              activeTab === 'registration'
                ? 'text-white border-b-2 border-[#5c4df0]'
                : 'text-muted-foreground hover:text-white'
            }`}
            onClick={() => setActiveTab('registration')}
            type="button"
          >
            Domain Registration & Search
          </button>
          <button
            className={`pb-2 transition duration-150 ${
              activeTab === 'manage'
                ? 'text-white border-b-2 border-[#5c4df0]'
                : 'text-muted-foreground hover:text-white'
            }`}
            onClick={() => setActiveTab('manage')}
            type="button"
          >
            My Registered Domains
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Domains Loading Failed"
          message="We were unable to fetch your registered domains."
          error={error}
          onRetry={() => void loadDomains()}
        />
      ) : null}

      {/* ── DOMAIN SEARCH HERO SECTION ── */}
      {activeTab === 'registration' && (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-950/40 via-[#121214] to-indigo-950/30 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-violet-600/15 blur-3xl" />

            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">
              <Sparkles className="h-3.5 w-3.5" />
              Instant WHOIS & TLD Availability
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Search & Register Your Domain
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Check availability across .com, .ng, .com.ng, .org, .net, and .co in real-time.
            </p>

            {/* Search Input */}
            <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => void handleSearch(e)}>
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 h-5 w-5 text-white/40" />
                <input
                  type="text"
                  placeholder="Enter your ideal domain (e.g. mycompany.com or brand)"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setHasSearched(false)
                  }}
                  className="w-full rounded-2xl border border-white/15 bg-white/5 pl-12 pr-4 py-3 text-base text-white placeholder-white/40 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition"
                />
              </div>
              <button
                type="submit"
                disabled={checking || !searchQuery.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5c4df0] px-6 py-3 font-semibold text-white shadow-lg shadow-violet-600/20 hover:bg-[#6c5df5] disabled:opacity-60 transition active:scale-[0.98]"
              >
                {checking ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                {checking ? 'Checking…' : 'Check Availability'}
              </button>
            </form>

            {/* TLD Pricing Chips */}
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="font-medium text-white/40">Pricing:</span>
              {TLD_PRICING.map((tld) => (
                <span
                  key={tld.tld}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1"
                >
                  <span className="font-semibold text-white">.{tld.tld}</span>
                  <span className="text-violet-300">{fmtPrice(tld.priceNgnYearly)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── SEARCH RESULTS GRID ── */}
          {hasSearched ? (
            checking ? (
              <div className="py-8 text-center space-y-3">
                <LoaderCircle className="h-8 w-8 animate-spin text-violet-400 mx-auto" />
                <p className="text-sm text-white/60">Checking domain availability across nameservers…</p>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Availability Results</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map((res) => (
                    <div
                      key={res.fullDomain}
                      className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl transition ${
                        res.isAvailable
                          ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                          : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-base font-bold text-white font-mono">{res.fullDomain}</h4>
                          <span className="text-xs text-white/50">{fmtPrice(res.priceNgnYearly)}</span>
                        </div>
                        {res.isAvailable ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Available
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400">
                            <XCircle className="h-3 w-3" /> Taken
                          </span>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
                        {res.isAvailable ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 transition"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Register Now
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white transition"
                          >
                            Transfer Domain
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          ) : null}
        </div>
      )}

      {/* Table Container for Registered Domains */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
          <h3 className="text-sm font-semibold text-white">Registered Domains Inventory</h3>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : activeTab === 'manage' && domains.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Globe className="h-7 w-7 text-violet-400" />}
              title="No Domains Under Management"
              description="Domains delegated or transferred to your Maxmark hosting account will appear here."
            />
          </div>
        ) : domains.length === 0 ? (
          <div className="p-6">
            <EmptyState
              badge="Domain Registrar"
              icon={<Globe className="h-7 w-7 text-violet-400" />}
              title="No Domains Registered"
              description="Use the domain search tool above to register new TLDs (.com, .org, .ng, .net) or transfer existing domains."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                  <th className="px-5 py-3 font-semibold">Domain</th>
                  <th className="px-5 py-3 font-semibold">Service</th>
                  <th className="px-5 py-3 font-semibold">Auto Renew</th>
                  <th className="px-5 py-3 font-semibold">Next Bill</th>
                  <th className="px-5 py-3 font-semibold">Price</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-xs text-white">
                {domains.map((dom) => (
                  <tr className="hover:bg-[#1c1c20] transition" key={dom.id}>
                    <td className="px-5 py-4">
                      <span className="underline hover:text-[#5c4df0] cursor-pointer font-medium">
                        {dom.domain}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      Domain Registration - .{dom.tld}
                    </td>
                    <td className="px-5 py-4">
                      {dom.autoRenew ? (
                        <span className="inline-flex border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex border border-muted/30 bg-muted/10 text-muted-foreground px-2 py-0.5 rounded-full text-[10px] font-semibold">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-medium">{fmtDate(dom.expiresAt)}</td>
                    <td className="px-5 py-4 font-medium">{fmtPrice(dom.priceNgnYearly)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex border px-2.5 py-0.5 rounded-md text-[10px] font-semibold uppercase ${statusBadgeClass(dom.status)}`}>
                        {dom.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ActionDropdown
                        items={[
                          {
                            label: 'Manage DNS Records',
                            icon: <Globe className="h-3.5 w-3.5 text-sky-400" />,
                            href: '/dns-zones',
                          },
                          {
                            label: 'SSL & Security',
                            icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
                            href: '/ssl',
                          },
                          {
                            label: 'Copy Domain Name',
                            onClick: () => {
                              navigator.clipboard.writeText(dom.domain)
                            },
                          },
                          {
                            label: 'Renew Registration',
                            onClick: () => {
                              alert(`Renewal requested for ${dom.domain}`)
                            },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
