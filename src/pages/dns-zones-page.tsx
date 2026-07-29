import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, MoreVertical, Search } from 'lucide-react'

import { fetchDnsZones, type DnsZone } from '@/lib/db/dns-zones'
import { supabase } from '@/lib/supabase'

const MOCK_ZONES: DnsZone[] = [
  {
    id: 'zone-1',
    zoneName: 'completeproperty.co.za',
    recordCount: 14,
    contact: 'hostmaster@completeproperty.co.za',
    createdAt: new Date().toISOString(),
  },
]

export function DnsZonesPage() {
  const [zones, setZones] = useState<DnsZone[]>(MOCK_ZONES)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetchDnsZones(sb)
        .then((live) => { if (live.length > 0) setZones(live) })
        .catch(() => { /* keep mock */ })
    })
  }, [])

  const filteredZones = zones.filter((zone) =>
    zone.zoneName.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground text-left">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span> <span className="text-white">DNS Zones</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">DNS Zones</h1>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white">
            Register Domain
          </button>
          <button className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition">
            Add DNS Zone
          </button>
        </div>
      </div>

      {/* DNS Zones Card/Table Container */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between bg-[#161619]">
          <h3 className="text-sm font-semibold text-white">DNS Zones</h3>

          <div className="relative text-xs w-[220px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="w-full bg-[#121214] border border-[#2d2d34] rounded pl-9 pr-4 py-2 text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                <th className="px-5 py-3 font-semibold">
                  <button className="flex items-center gap-1.5 hover:text-white transition">
                    Domain
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3 font-semibold">Records</th>
                <th className="px-5 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232328] text-xs text-white">
              {filteredZones.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={4}>
                    No DNS zones found.
                  </td>
                </tr>
              ) : (
                filteredZones.map((zone) => (
                  <tr className="hover:bg-[#1c1c20] transition" key={zone.id}>
                    <td className="px-5 py-4">
                      <span className="underline hover:text-[#5c4df0] cursor-pointer font-medium">
                        {zone.zoneName}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-white font-medium">{zone.recordCount}</td>
                    <td className="px-5 py-4 text-white">{zone.contact}</td>
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
