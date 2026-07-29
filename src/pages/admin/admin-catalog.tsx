import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  mockAdminDnsZones,
  mockAdminDomains,
  mockAdminPlans,
  mockAdminUsers,
} from '@/data/mockAdmin'
import {
  fetchAdminDnsZones,
  fetchAdminDomains,
  fetchAdminPlans,
  fetchAllProfiles,
  type AdminDnsZoneRow,
  type AdminDomainRow,
  type AdminPlanRow,
  type AdminProfile,
} from '@/lib/db/admin'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDateLabel } from '@/lib/utils'
import {
  AdminPageHeader,
  EmptyRow,
  StatusBadge,
  TableCard,
  cellClass,
  rowClass,
  tableClass,
  tbodyClass,
  theadRowClass,
  thClass,
} from '@/components/admin/admin-ui'

export function AdminCatalog() {
  const [plans, setPlans] = useState<AdminPlanRow[]>(mockAdminPlans)
  const [domains, setDomains] = useState<AdminDomainRow[]>(mockAdminDomains)
  const [zones, setZones] = useState<AdminDnsZoneRow[]>(mockAdminDnsZones)
  const [profiles, setProfiles] = useState<AdminProfile[]>(mockAdminUsers)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const [livePlans, liveDomains, liveZones, liveProfiles] = await Promise.all([
          fetchAdminPlans(sb),
          fetchAdminDomains(sb),
          fetchAdminDnsZones(sb),
          fetchAllProfiles(sb),
        ])
        setPlans(livePlans)
        setDomains(liveDomains)
        setZones(liveZones)
        setProfiles(liveProfiles)
      } catch (error) {
        console.warn('Admin catalog fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  const ownerByUser = useMemo(
    () => new Map(profiles.map((p) => [p.userId, p.displayName || p.accountId])),
    [profiles],
  )

  function ownerCell(userId: string) {
    return (
      <Link
        className="text-[#5c4df0] hover:text-[#796ef3] hover:underline"
        to={`/admin/users/${userId}`}
      >
        {ownerByUser.get(userId) ?? userId.slice(0, 8)}
      </Link>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Read-only oversight of hosting plans, registered domains, and DNS zones."
        title="Catalog"
      />

      <TableCard footer={<span>{plans.length} plans</span>} title="Hosting plans">
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Customer</th>
              <th className={thClass}>Plan</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Region</th>
              <th className={thClass}>Sites limit</th>
              <th className={thClass}>Yearly price</th>
              <th className={thClass}>Renews</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {plans.map((plan) => (
              <tr className={rowClass} key={plan.id}>
                <td className={cellClass}>{ownerCell(plan.userId)}</td>
                <td className={`${cellClass} font-semibold`}>{plan.name}</td>
                <td className={cellClass}>
                  <StatusBadge tone="violet">{plan.type}</StatusBadge>
                </td>
                <td className={`${cellClass} text-muted-foreground`}>{plan.region}</td>
                <td className={`${cellClass} text-muted-foreground`}>{plan.sitesLimit}</td>
                <td className={`${cellClass} font-semibold`}>
                  {formatCurrency(plan.priceNgnYearly)}
                </td>
                <td className={`${cellClass} text-muted-foreground`}>{plan.renewalDate}</td>
                <td className={cellClass}>
                  <StatusBadge tone={plan.status === 'active' ? 'green' : 'zinc'}>
                    {plan.status}
                  </StatusBadge>
                </td>
              </tr>
            ))}
            {plans.length === 0 ? <EmptyRow colSpan={8} message="No hosting plans." /> : null}
          </tbody>
        </table>
      </TableCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TableCard footer={<span>{domains.length} domains</span>} title="Registered domains">
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Domain</th>
                <th className={thClass}>Owner</th>
                <th className={thClass}>Expires</th>
                <th className={thClass}>Auto-renew</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {domains.map((domain) => (
                <tr className={rowClass} key={domain.id}>
                  <td className={`${cellClass} font-semibold`}>{domain.domain}</td>
                  <td className={cellClass}>{ownerCell(domain.userId)}</td>
                  <td className={`${cellClass} text-muted-foreground`}>{domain.expiresAt}</td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {domain.autoRenew ? 'Yes' : 'No'}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge
                      tone={
                        domain.status === 'active'
                          ? 'green'
                          : domain.status === 'expired'
                            ? 'red'
                            : 'zinc'
                      }
                    >
                      {domain.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
              {domains.length === 0 ? (
                <EmptyRow colSpan={5} message="No registered domains." />
              ) : null}
            </tbody>
          </table>
        </TableCard>

        <TableCard footer={<span>{zones.length} zones</span>} title="DNS zones">
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Zone</th>
                <th className={thClass}>Owner</th>
                <th className={thClass}>Records</th>
                <th className={thClass}>Created</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {zones.map((zone) => (
                <tr className={rowClass} key={zone.id}>
                  <td className={`${cellClass} font-semibold`}>{zone.zoneName}</td>
                  <td className={cellClass}>{ownerCell(zone.userId)}</td>
                  <td className={cellClass}>
                    <StatusBadge tone="violet">{zone.recordCount}</StatusBadge>
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {formatDateLabel(zone.createdAt)}
                  </td>
                </tr>
              ))}
              {zones.length === 0 ? <EmptyRow colSpan={4} message="No DNS zones." /> : null}
            </tbody>
          </table>
        </TableCard>
      </div>
    </div>
  )
}
