import { useEffect, useState } from 'react'

import { mockAuditLog } from '@/data/mockAdmin'
import { fetchAuditLog, type AuditEntry } from '@/lib/db/admin'
import { supabase } from '@/lib/supabase'
import { formatDateLabel } from '@/lib/utils'
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

export function AdminAudit() {
  const [entries, setEntries] = useState<AuditEntry[]>(mockAuditLog)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        setEntries(await fetchAuditLog(sb))
      } catch (error) {
        console.warn('Audit log fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Append-only record of every mutation performed through the admin console (latest 200)."
        title="Audit log"
      />

      <TableCard footer={<span>{entries.length} entries</span>} title="Admin actions">
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Action</th>
              <th className={thClass}>Target</th>
              <th className={thClass}>Payload</th>
              <th className={thClass}>Admin</th>
              <th className={thClass}>When</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {entries.map((entry) => (
              <tr className={rowClass} key={entry.id}>
                <td className={cellClass}>
                  <StatusBadge tone="violet">{entry.action}</StatusBadge>
                </td>
                <td className={`${cellClass} text-muted-foreground`}>
                  {entry.targetType ?? 'system'}
                  {entry.targetId ? (
                    <span className="font-mono text-[10px]"> · {entry.targetId}</span>
                  ) : null}
                </td>
                <td className={`${cellClass} max-w-[340px]`}>
                  <code
                    className="block truncate font-mono text-[10px] text-muted-foreground"
                    title={JSON.stringify(entry.payload)}
                  >
                    {JSON.stringify(entry.payload)}
                  </code>
                </td>
                <td className={`${cellClass} font-mono text-[10px] text-muted-foreground`}>
                  {entry.adminUserId.slice(0, 8)}
                </td>
                <td className={`${cellClass} text-muted-foreground`}>
                  {formatDateLabel(entry.createdAt)}
                </td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <EmptyRow colSpan={5} message="No admin actions recorded yet." />
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </div>
  )
}
