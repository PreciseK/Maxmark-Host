import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  Bell,
  CircleDollarSign,
  Database,
  FileText,
  GitBranch,
  Globe,
  Globe2,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  ScrollText,
  Server,
  ShieldAlert,
  ShieldCheck,
  Store,
  Terminal,
  Users,
} from 'lucide-react'

import { fetchAdminUnreadTotal } from '@/lib/db/support'
import { subscribeToAdminInbox } from '@/lib/support-realtime'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'

const adminNavItems = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard, end: true },
  { label: 'System Health', href: '/admin/system', icon: Activity },
  { label: 'Environments & Runtimes', href: '/admin/environments', icon: Terminal },
  { label: 'Deployments & CI/CD', href: '/admin/deployments', icon: GitBranch },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Sites', href: '/admin/sites', icon: Globe2 },
  { label: 'Plans & Pricing', href: '/admin/plans', icon: Layers },
  { label: 'Databases & Caches', href: '/admin/databases', icon: Database },
  { label: 'SSL & Encryption', href: '/admin/ssl', icon: Lock },
  { label: 'Domains & DNS', href: '/admin/domains', icon: Globe },
  { label: 'Nodes', href: '/admin/nodes', icon: Server },
  { label: 'Billing', href: '/admin/billing', icon: CircleDollarSign },
  { label: 'Marketplace', href: '/admin/marketplace', icon: Store },
  { label: 'Support', href: '/admin/support', icon: MessageSquare },
  { label: 'Broadcasts & Emails', href: '/admin/notifications', icon: Bell },
  { label: 'Global Backups', href: '/admin/backups', icon: Database },
  { label: 'Security & Firewall', href: '/admin/security', icon: ShieldAlert },
  { label: 'Catalog', href: '/admin/catalog', icon: Layers },
  { label: 'Dashboard Content', href: '/admin/content', icon: FileText },
  { label: 'Audit Log', href: '/admin/audit', icon: ScrollText },
]

export function AdminShell() {
  const { session, adminSupportUnread, setAdminSupportUnread } = useSession()

  // Inbox badge: unread customer messages across non-closed conversations.
  // The inbox page keeps this in sync while open; this effect covers every
  // other admin page.
  useEffect(() => {
    if (!supabase || !session) return
    const sb = supabase
    let cancelled = false

    const refresh = () => {
      fetchAdminUnreadTotal(sb)
        .then((total) => {
          if (!cancelled) setAdminSupportUnread(total)
        })
        .catch(() => undefined)
    }

    refresh()
    const unsubscribe = subscribeToAdminInbox(sb, refresh, 'support-admin-badge')

    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const adminEmail = session?.user.email ?? 'admin@maxmark.host'
  const initials = adminEmail.slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col min-h-screen bg-[#121214] text-white">
      {/* Admin context banner */}
      <div className="w-full bg-[#3a2c46] text-[#e6d1f0] py-2.5 px-4 text-center text-xs font-medium border-b border-white/5 select-none">
        Admin console — actions here affect customer accounts and are recorded in the audit
        log.
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="hidden w-[260px] shrink-0 flex-col justify-between border-r border-[#232328] bg-[#161618] select-none lg:flex">
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            <div className="p-5 border-b border-[#232328] shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white leading-none">
                  Maxmark
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#5c4df0]/15 border border-[#5c4df0]/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#a89cf7]">
                  <ShieldCheck className="h-3 w-3" />
                  Admin
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1.5 leading-none">
                Operations console
              </p>
            </div>

            <nav className="px-3 py-3 space-y-1 flex-1">
              {adminNavItems.map((item) => {
                const Icon = item.icon
                const badge =
                  item.href === '/admin/support' && adminSupportUnread > 0
                    ? adminSupportUnread
                    : null
                return (
                  <NavLink
                    className={({ isActive }) =>
                      cn(
                        'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-[#262629] text-white'
                          : 'text-muted-foreground hover:bg-[#1a1a1d] hover:text-white',
                      )
                    }
                    end={item.end}
                    key={item.href}
                    to={item.href}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {badge !== null ? (
                      <span className="bg-[#5c4df0] text-[10px] font-semibold px-2 py-0.5 rounded-full text-white">
                        {badge}
                      </span>
                    ) : null}
                  </NavLink>
                )
              })}
            </nav>
          </div>

          {/* Back to customer app */}
          <div className="p-4 border-t border-[#232328] bg-[#131315] shrink-0">
            <Link
              className="flex items-center justify-center gap-2 py-2 bg-[#1c1c1f] rounded-md border border-[#2d2d34] hover:bg-[#262629] transition duration-150 text-xs font-semibold text-muted-foreground hover:text-white"
              to="/home"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to customer app
            </Link>
          </div>
        </aside>

        {/* Right Content Pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#121214]">
          <nav aria-label="Admin navigation" className="flex gap-2 overflow-x-auto border-b border-[#232328] px-3 py-2 lg:hidden">
            {adminNavItems.map((item) => (
              <NavLink
                className={({ isActive }) => cn('shrink-0 rounded-md px-3 py-2 text-xs font-semibold', isActive ? 'bg-[#5c4df0] text-white' : 'bg-[#1c1c1f] text-white/70')}
                end={item.end}
                key={item.href}
                to={item.href}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <header className="flex items-center justify-between border-b border-[#232328] px-6 py-4 bg-[#121214] shrink-0 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <div>
                Signed in as: <span className="text-white font-medium">{adminEmail}</span>
              </div>
              <div className="w-px h-3 bg-[#232328] hidden sm:block" />
              <div>
                Role:{' '}
                <span className="text-[#a89cf7] font-semibold uppercase tracking-wider">
                  Administrator
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 border border-[#2d2d34] bg-[#161619] rounded-md px-3 py-1.5 select-none">
                <div className="h-5 w-5 bg-[#5c4df0] rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase">
                  {initials}
                </div>
                <span className="text-xs font-semibold text-white">Admin</span>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
