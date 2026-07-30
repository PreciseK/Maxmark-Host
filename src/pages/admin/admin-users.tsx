import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Search } from 'lucide-react'

import { mockAdminUsers } from '@/data/mockAdmin'
import { fetchAllProfiles } from '@/lib/db/admin'
import { listUsersViaFunction, type AdminListedUser } from '@/lib/functions'
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

const PAGE_SIZE = 25

export function AdminUsers() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminListedUser[]>(
    mockAdminUsers.map((u) => ({ ...u, avatarUrl: null })),
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        // list_users needs the admin-actions function (auth emails live in
        // auth.users). If the function is unavailable, fall back to profiles
        // readable under the admin RLS policy.
        const { users: liveUsers } = await listUsersViaFunction(sb, 1, 200)
        setUsers(liveUsers)
      } catch (error) {
        console.warn('list_users failed, falling back to profiles:', error)
        try {
          const profiles = await fetchAllProfiles(sb)
          if (profiles.length > 0) {
            setUsers(
              profiles.map((p) => ({
                ...p,
                email: '',
                avatarUrl: null,
                lastSignInAt: null,
                siteCount: 0,
                planCount: 0,
              })),
            )
          }
        } catch (fallbackError) {
          console.warn('Profile fallback failed, keeping demo data:', fallbackError)
        }
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        u.displayName.toLowerCase().includes(term) ||
        u.accountId.toLowerCase().includes(term),
    )
  }, [users, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Every registered customer account, with hosting footprint at a glance."
        title="Users"
      />

      <TableCard
        actions={
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="w-full bg-[#1c1c1f] border border-[#2d2d34] rounded-md pl-9 pr-4 py-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search email, name, or account ID"
              type="text"
              value={search}
            />
          </div>
        }
        footer={
          <>
            <span>
              {filtered.length} account{filtered.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-0.5 hover:text-white disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                &lt;
              </button>
              <span className="font-semibold text-white">
                {currentPage} / {pageCount}
              </span>
              <button
                className="px-2 py-0.5 hover:text-white disabled:opacity-40"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                &gt;
              </button>
            </div>
          </>
        }
        title="Accounts"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>
                <button className="flex items-center gap-1.5 hover:text-white transition">
                  Customer
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className={thClass}>Account ID</th>
              <th className={thClass}>Sites</th>
              <th className={thClass}>Plans</th>
              <th className={thClass}>Joined</th>
              <th className={thClass}>Last sign-in</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {pageRows.map((user) => (
              <tr
                className={`${rowClass} cursor-pointer`}
                key={user.userId}
                onClick={() =>
                  navigate(`/admin/users/${user.userId}`, { state: { email: user.email } })
                }
              >
                <td className={cellClass}>
                  <div className="flex items-center gap-2.5">
                    {user.avatarUrl ? (
                      <img
                        alt=""
                        className="h-7 w-7 rounded-full object-cover shrink-0"
                        src={user.avatarUrl}
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0">
                        {(user.displayName || user.email || '?').slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-white">
                        {user.displayName || user.email || 'Unnamed account'}
                      </p>
                      {user.email ? (
                        <p className="text-muted-foreground mt-0.5">{user.email}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className={`${cellClass} text-muted-foreground font-mono`}>
                  {user.accountId || '—'}
                </td>
                <td className={cellClass}>
                  <StatusBadge tone={user.siteCount > 0 ? 'violet' : 'zinc'}>
                    {user.siteCount}
                  </StatusBadge>
                </td>
                <td className={cellClass}>
                  <StatusBadge tone={user.planCount > 0 ? 'green' : 'zinc'}>
                    {user.planCount}
                  </StatusBadge>
                </td>
                <td className={`${cellClass} text-muted-foreground`}>
                  {formatDateLabel(user.createdAt)}
                </td>
                <td className={`${cellClass} text-muted-foreground`}>
                  {user.lastSignInAt ? formatDateLabel(user.lastSignInAt) : 'Never'}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 ? (
              <EmptyRow colSpan={6} message="No accounts match this search." />
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </div>
  )
}
