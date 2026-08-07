import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, Globe, Search } from 'lucide-react'

import { fetchDnsZones, type DnsZone } from '@/lib/db/dns-zones'
import { supabase } from '@/lib/supabase'
import { EmptyState, ErrorState, NoSearchResultState, TableSkeleton } from '@/components/ui/ui-states'
import { ActionDropdown } from '@/components/ui/dropdown-menu'

export function DnsZonesPage() {
  const [zones, setZones] = useState<DnsZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadZones = async () => {
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
      const data = await fetchDnsZones(sb)
      setZones(data)
    } catch (err) {
      console.error('DNS zones fetch error:', err)
      setError(err instanceof Error ? err.message : 'DNS zones could not be loaded.')
      setZones([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadZones()
  }, [])

  const filteredZones = zones.filter((zone) =>
    zone.zoneName.toLowerCase().includes(searchQuery.toLowerCase().trim()),
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
          <Link
            to="/domains"
            className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white"
          >
            Register Domain
          </Link>
          <button className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition">
            Add DNS Zone
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="DNS Loading Failed"
          message="We were unable to load your DNS zones."
          error={error}
          onRetry={() => void loadZones()}
        />
      ) : null}

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
              placeholder="Search zones…"
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        {/* Table / Content States */}
        {loading ? (
          <TableSkeleton rows={4} />
        ) : zones.length === 0 ? (
          <div className="p-6">
            <EmptyState
              badge="Cloud DNS"
              icon={<Globe className="h-7 w-7 text-violet-400" />}
              title="No DNS Zones Configured"
              description="Manage A, AAAA, CNAME, MX, and TXT records for custom domains on high-availability nameservers."
              actionLabel="Add DNS Zone"
            />
          </div>
        ) : searchQuery.trim().length > 0 && filteredZones.length === 0 ? (
          <div className="p-6">
            <NoSearchResultState
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          </div>
        ) : (
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
                {filteredZones.map((zone) => (
                  <tr className="hover:bg-[#1c1c20] transition" key={zone.id}>
                    <td className="px-5 py-4">
                      <span className="underline hover:text-[#5c4df0] cursor-pointer font-medium">
                        {zone.zoneName}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-white font-medium">{zone.recordCount}</td>
                    <td className="px-5 py-4 text-white">{zone.contact}</td>
                    <td className="px-5 py-4 text-right">
                      <ActionDropdown
                        items={[
                          {
                            label: 'Edit DNS Records',
                            onClick: () => {
                              alert(`Editing DNS records for ${zone.zoneName}`)
                            },
                          },
                          {
                            label: 'Copy Nameservers',
                            onClick: () => {
                              navigator.clipboard.writeText('ns1.maxmark.com.ng\nns2.maxmark.com.ng')
                            },
                          },
                          {
                            label: 'Export BIND Zone File',
                            onClick: () => {
                              alert(`Exporting BIND zone file for ${zone.zoneName}`)
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
