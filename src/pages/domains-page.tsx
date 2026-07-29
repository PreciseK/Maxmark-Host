import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreVertical } from 'lucide-react'

import { fetchRegisteredDomains, type RegisteredDomain } from '@/lib/db/domains'
import { supabase } from '@/lib/supabase'

const MOCK_DOMAINS: RegisteredDomain[] = [
  {
    id: 'dom-1',
    domain: 'completeproperty.co.za',
    tld: 'co.za',
    status: 'suspended',
    expiresAt: '2027-03-07',
    autoRenew: true,
    priceNgnYearly: 42075,
    createdAt: new Date().toISOString(),
  },
]

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
  const [domains, setDomains] = useState<RegisteredDomain[]>(MOCK_DOMAINS)
  const [activeTab, setActiveTab] = useState<'registration' | 'manage'>('registration')

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetchRegisteredDomains(sb)
        .then((live) => { if (live.length > 0) setDomains(live) })
        .catch(() => { /* keep mock */ })
    })
  }, [])

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
          >
            Domain Registration
          </button>
          <button
            className={`pb-2 transition duration-150 ${
              activeTab === 'manage'
                ? 'text-white border-b-2 border-[#5c4df0]'
                : 'text-muted-foreground hover:text-white'
            }`}
            onClick={() => setActiveTab('manage')}
          >
            Manage Domain
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
          <h3 className="text-sm font-semibold text-white">Domains</h3>
        </div>

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
              {activeTab === 'manage' ? (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={7}>
                    No domains in management list.
                  </td>
                </tr>
              ) : domains.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={7}>
                    No registered domains found.
                  </td>
                </tr>
              ) : (
                domains.map((dom) => (
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
                    <td className="px-5 py-4">
                      <button className="text-muted-foreground hover:text-white transition">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
