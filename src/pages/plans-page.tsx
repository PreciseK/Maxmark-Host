import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, MoreVertical, Plus } from 'lucide-react'

import { fetchPlans, type HostingPlan } from '@/lib/db/plans'
import { supabase } from '@/lib/supabase'

const MOCK_PLANS: HostingPlan[] = [
  {
    id: 'plan-1',
    name: 'WordPress VIP Plan',
    type: 'VIP',
    region: 'UK South',
    sitesLimit: 1,
    appEnvironment: 'WordPress',
    priceNgnYearly: 313434,
    renewalDate: '2027-03-14',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
]

function regionFlag(region: string): { emoji: string; label: string } {
  const r = region.toLowerCase()
  if (r.includes('uk') || r.includes('london')) return { emoji: '🇬🇧', label: 'UK' }
  if (r.includes('us') || r.includes('new york') || r.includes('chicago')) return { emoji: '🇺🇸', label: 'US' }
  if (r.includes('eu') || r.includes('frankfurt') || r.includes('amsterdam')) return { emoji: '🇪🇺', label: 'EU' }
  if (r.includes('sg') || r.includes('singapore')) return { emoji: '🇸🇬', label: 'SG' }
  if (r.includes('ng') || r.includes('lagos') || r.includes('nigeria')) return { emoji: '🇳🇬', label: 'NG' }
  return { emoji: '🌐', label: region }
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  )
}

function fmtPrice(ngnYearly: number): string {
  return (
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(ngnYearly) +
    ' / yr'
  )
}

export function PlansPage() {
  const [plans, setPlans] = useState<HostingPlan[]>(MOCK_PLANS)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetchPlans(sb)
        .then((live) => { if (live.length > 0) setPlans(live) })
        .catch(() => { /* keep mock */ })
    })
  }, [])

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span> <span className="text-white">Plans</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Plans</h1>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition">
          <Plus className="h-4 w-4" />
          Create Plan
        </button>
      </div>

      {/* Plans Card/Table */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#232328]">
          <h3 className="text-sm font-semibold text-white">Plans</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                <th className="px-5 py-3 font-semibold">
                  <button className="flex items-center gap-1.5 hover:text-white transition">
                    Name
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3 font-semibold">Sites Used</th>
                <th className="px-5 py-3 font-semibold">App Environment</th>
                <th className="px-5 py-3 font-semibold">
                  <button className="flex items-center gap-1.5 hover:text-white transition">
                    Type
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3 font-semibold">Price</th>
                <th className="px-5 py-3 font-semibold">
                  <button className="flex items-center gap-1.5 hover:text-white transition">
                    Renewal Date
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232328] text-xs text-white">
              {plans.map((plan) => {
                const { emoji, label } = regionFlag(plan.region)
                return (
                  <tr className="hover:bg-[#1c1c20] transition" key={plan.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none select-none">{plan.name}</span>
                        <span
                          className="inline-flex items-center justify-center bg-[#202024] border border-[#2d2d34] h-5 w-5 rounded-full text-xs"
                          title={label}
                        >
                          {emoji}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">– / {plan.sitesLimit}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 rounded-full bg-[#0073aa] items-center justify-center text-[10px] font-bold font-serif text-white select-none">
                          W
                        </span>
                        <span>{plan.appEnvironment}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold">{plan.type}</td>
                    <td className="px-5 py-4">{fmtPrice(plan.priceNgnYearly)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{fmtDate(plan.renewalDate)}</td>
                    <td className="px-5 py-4">
                      <button className="text-muted-foreground hover:text-white transition">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
