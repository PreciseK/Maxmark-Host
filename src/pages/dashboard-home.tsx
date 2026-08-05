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
} from 'lucide-react'

import { fetchBillingData, type BillingData } from '@/lib/db/billing'
import { fetchSites } from '@/lib/db/sites'
import { fetchConversations } from '@/lib/db/support'
import { supabase } from '@/lib/supabase'
import type { ManagedSite } from '@/types/provisioning'

// Reusable Status Widget Component
export function StatusWidget() {
  const [openSection, setOpenSection] = useState<string | null>(null)

  const sections = [
    { id: 'support', name: 'Support Services', status: 'Operational' },
    { id: 'platform', name: 'Platform Operations', status: 'Operational' },
    { id: 'wordpress', name: 'Managed WordPress', status: 'Operational' },
    { id: 'cloud', name: 'Maxmark Cloud', status: 'Operational' },
    { id: 'container', name: 'Cloud Container Services', status: 'Operational' },
    { id: 'network', name: 'Data Centers & Network', status: 'Operational' },
  ]

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id)
  }

  return (
    <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Status</h3>
        <Link aria-label="Open support" className="text-[#5c4df0] hover:text-[#796ef3]" to="/support">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex items-center gap-2 bg-[#121214] border border-[#232328] rounded-md p-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        <span className="text-xs font-medium text-emerald-500">All Systems Operational</span>
      </div>

      <div className="divide-y divide-[#232328]">
        {sections.map((sec) => {
          const isOpen = openSection === sec.id
          return (
            <div className="py-2.5 first:pt-0 last:pb-0" key={sec.id}>
              <button
                className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-white transition-colors py-1"
                onClick={() => toggleSection(sec.id)}
              >
                <span>{sec.name}</span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {isOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {isOpen ? (
                <div className="mt-2 pl-2 text-[11px] text-muted-foreground bg-[#121214] p-2 rounded border border-[#232328]">
                  All components under {sec.name} are fully operational with normal latency levels.
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Reusable Scheduled Maintenance Component
export function ScheduledMaintenanceWidget() {
  return (
    <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Scheduled Maintenance</h3>
        <Link aria-label="Open maintenance support" className="text-[#5c4df0] hover:text-[#796ef3]" to="/support">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3">
        <div className="p-3 bg-[#121214] border border-[#232328] rounded-md">
          <Link className="text-xs font-semibold text-white hover:text-[#5c4df0] underline transition-colors" to="/support">
            Scheduled Maintenance - Subset of Cloudhosts on US-Midwest-1 & US-West-1
          </Link>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            <span className="font-semibold text-amber-500 uppercase tracking-wider text-[9px] block mb-1">
              Scheduled
            </span>
            Maxmark systems engineers will be performing scheduled maintenance on the underlying
            hardware supporting servers.
          </p>
          <div className="text-[10px] text-muted-foreground/80 mt-3 pt-2 border-t border-[#232328]">
            Scheduled for Apr 1, 2026 9:00 AM - Apr 1, 2026 11:00 AM
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardHome() {
  const [sites, setSites] = useState<ManagedSite[]>([])
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [activeCasesCount, setActiveCasesCount] = useState<number>(0)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetchSites(sb).then(setSites).catch(() => setSites([]))
      fetchBillingData(sb).then(setBilling).catch(() => setBilling(null))
      fetchConversations(sb).then((convs) => setActiveCasesCount(convs.filter(c => c.status === 'open').length)).catch(() => setActiveCasesCount(0))
    })
  }, [])

  const primarySite = sites[0] ?? null
  const unpaidInvoices = billing?.invoices.filter((i) => i.status === 'unpaid') ?? []
  const totalUnpaidNgn = unpaidInvoices.reduce((acc, i) => acc + i.totalNgn, 0)
  const fmtNgn = (n: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Home</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Main Dashboard Widget Cards */}
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

          {/* Quick WordPress Access Card */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
            {primarySite ? (
              <>
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
                    className="flex-1 text-center py-2.5 bg-[#202024] hover:bg-[#2c2c32] rounded-md border border-[#2d2d34] text-xs font-semibold transition"
                    to={`/sites/${primarySite.id}`}
                  >
                    Site Dashboard
                  </Link>
                  <button
                    className="flex-1 py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition"
                    onClick={() => window.open(`https://${primarySite.site_domain}/wp-admin`, '_blank', 'noopener,noreferrer')}
                  >
                    Enter WordPress
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No sites provisioned yet.</p>
                <Link
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition"
                  to="/sites"
                >
                  <Plus className="h-4 w-4" />
                  Provision Your First Site
                </Link>
              </div>
            )}
          </div>

          {/* Search Knowledge Base Card */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Search our Knowledge Base
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full bg-[#121214] border border-[#232328] rounded-md pl-9 pr-4 py-2 text-sm text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/55"
                />
              </div>
              <button className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-sm font-medium border border-[#2d2d34] transition">
                Search
              </button>
            </div>
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
