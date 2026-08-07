import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router-dom'
import {
  CircleDollarSign,
  Code,
  Eye,
  EyeOff,
  Globe2,
  HelpCircle,
  Home,
  Layers,
  Mail,
  MessageSquare,
  Phone,
  Search,
  ChevronLeft,
  Key,
  Cloud,
  History,
  GitBranch,
  PenTool,
  TrendingUp,
  Settings,
  Database,
  Lock,
  FileText,
  Clock,
  Box,
  Link2,
  ChevronUp,
  ChevronDown,
  Globe,
  Receipt,
  Coins,
  CreditCard,
  ShieldCheck,
  ShoppingCart,
  Store,
  Menu,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'
import { ChatWidget } from '@/components/support/chat-widget'

// Main Sidebar links
const mainNavItems = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Plans', href: '/plans', icon: Layers },
  { label: 'Domains', href: '/domains', icon: Code },
  { label: 'Sites', href: '/sites', icon: Globe2 },
  { label: 'Marketplace', href: '/marketplace', icon: Store },
  { label: 'Billing', href: '/billing', icon: CircleDollarSign },
  { label: 'Support', href: '/support', icon: HelpCircle },
]

// Site-specific sub-sidebar links
const siteNavItems = [
  { label: 'Overview', tabId: 'credentials', icon: Home },
  { label: 'SFTP / SSH', tabId: 'sftp', icon: Key },
  { label: 'Cloudflare Integration', tabId: 'cloudflare', icon: Cloud },
  { label: 'WordPress Backups', tabId: 'backups', icon: History },
  { label: 'Staging Environment', tabId: 'staging', icon: GitBranch },
  { label: 'PHP Engine & Config', tabId: 'php-version', icon: PenTool },
  { label: 'Analytics & Traffic', tabId: 'traffic-metrics', icon: TrendingUp },
  { label: 'Tools & Reset', tabId: 'site-reset', icon: Settings },
  { label: 'Database Admin', tabId: 'database-admin', icon: Database },
  { label: 'Free SSL Certificate', tabId: 'ssl-tls', icon: Lock },
  { label: 'Access Logs', tabId: 'access-logs', icon: FileText },
  { label: 'Cron Jobs', tabId: 'cron-jobs', icon: Clock },
  { label: 'Object Cache (Redis)', tabId: 'object-cache', icon: Box },
  { label: 'Domain Redirection', tabId: 'domain-redirect', icon: Link2 },
]

// Billing sub-sidebar links
const billingNavItems = [
  { label: 'Invoices', tabId: 'invoices', icon: Receipt },
  { label: 'Billing Details', tabId: 'details', icon: Coins },
  { label: 'Payment Info', tabId: 'payment-info', icon: CreditCard },
  { label: 'Orders', tabId: 'orders', icon: ShoppingCart },
]

export function DashboardShell() {
  const location = useLocation()
  const { session, isAdmin, supportUnread, avatarUrl, accountId, supportPin } =
    useSession()
  const [showPin, setShowPin] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [showMore, setShowMore] = useState(() => {
    return location.pathname === '/ssl' || location.pathname === '/dns-zones'
  })
  const [prevLocationKey, setPrevLocationKey] = useState(location.key)

  if (prevLocationKey !== location.key) {
    setPrevLocationKey(location.key)
    setMobileNavOpen(false)
  }

  const { siteId } = useParams()
  const [searchParams] = useSearchParams()

  const [itemCounts, setItemCounts] = useState<{ sites: number; domains: number }>({ sites: 0, domains: 0 })

  useEffect(() => {
    if (!supabase || !session) return
    let active = true

    Promise.all([
      supabase.from('user_sites').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
      supabase.from('registered_domains').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
    ])
      .then(([sitesRes, domainsRes]) => {
        if (active) {
          setItemCounts({
            sites: sitesRes.count ?? 0,
            domains: domainsRes.count ?? 0,
          })
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [session])

  const isSiteDetail = siteId !== undefined && location.pathname.startsWith('/sites/')
  const isBilling = location.pathname.startsWith('/billing')
  const activeTab = searchParams.get('tab') || (isBilling ? 'invoices' : 'credentials')

  // CustomerRoute guarantees a session here, so these only ever render the
  // signed-in identity; the empty fallbacks exist to satisfy the null type.
  const clientEmail = session?.user.email ?? ''
  const clientName = session?.user.email
    ? session.user.email.split('@')[0].replace(/[._-]+/g, ' ')
    : ''
  const clientInitials = clientName
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col min-h-screen bg-[#121214] text-white">
      {/* Top Notification Banner */}
      <div className="w-full bg-[#2C2C46] text-[#d1d1f0] py-2.5 px-4 text-center text-xs font-medium border-b border-white/5 select-none">
        Maxmark Host operations dashboard — hosting, billing, domains, and support in one place.
      </div>

      <div className="flex flex-1 overflow-hidden">
        {mobileNavOpen ? (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            type="button"
          />
        ) : null}
        {/* Left Sidebar */}
        <aside className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[min(85vw,260px)] shrink-0 flex-col justify-between border-r border-[#232328] bg-[#161618] shadow-2xl transition-transform duration-200 select-none lg:static lg:w-[260px] lg:translate-x-0 lg:shadow-none',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}>
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            
            {/* Logo Area - Hidden in Site Detail Sidebar to match Screenshot 1 */}
            {!isSiteDetail && (
              <div className="p-5 border-b border-[#232328] shrink-0">
                <h2 className="text-xl font-bold tracking-tight text-white leading-none">
                  Maxmark Host
                </h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1.5 leading-none">
                  Managed hosting suite
                </p>
              </div>
            )}

            {/* Sidebar Search - Always shown */}
            <div className="px-4 py-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full bg-[#1c1c1f] border border-[#2d2d34] rounded-md pl-9 pr-4 py-2 text-sm text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors"
                  placeholder="Search"
                  type="text"
                />
              </div>
            </div>

            {/* Navigation Menu */}
            <nav className="px-3 py-2 space-y-1 flex-1">
              {isSiteDetail ? (
                // MODE 1: Site-specific sidebar
                <>
                  <Link
                    to="/plans"
                    className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-white hover:bg-[#1a1a1d] transition duration-150 mb-3"
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>Back to WordPress VIP Plan</span>
                  </Link>

                  {siteNavItems.map((item) => {
                    const Icon = item.icon
                    const isTabActive = activeTab === item.tabId
                    return (
                      <Link
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold transition-colors duration-150',
                          isTabActive
                            ? 'bg-[#262629] text-white'
                            : 'text-muted-foreground hover:bg-[#1a1a1d] hover:text-white',
                        )}
                        key={item.tabId}
                        to={`/sites/${siteId}?tab=${item.tabId}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}

                  <button className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-[#1a1a1d] hover:text-white transition duration-150">
                    <ChevronUp className="h-4 w-4 shrink-0" />
                    <span>Show Less</span>
                  </button>
                </>
              ) : isBilling ? (
                // MODE 4: Billing Sidebar
                <>
                  <Link
                    to="/home"
                    className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-white hover:bg-[#1a1a1d] transition duration-150 mb-3"
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>Back to Home</span>
                  </Link>

                  {billingNavItems.map((item) => {
                    const Icon = item.icon
                    const isTabActive = activeTab === item.tabId
                    return (
                      <Link
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold transition-colors duration-150',
                          isTabActive
                            ? 'bg-[#262629] text-white'
                            : 'text-muted-foreground hover:bg-[#1a1a1d] hover:text-white',
                        )}
                        key={item.tabId}
                        to={`/billing?tab=${item.tabId}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </>
              ) : (
                // MODE 3: Main dashboard sidebar
                <>
                  {mainNavItems.map((item) => {
                    const Icon = item.icon
                    const isSupport = item.href === '/support'
                    let badge: string | undefined = undefined
                    if (isSupport && supportUnread > 0) badge = String(supportUnread)
                    else if (item.href === '/plans' && itemCounts.sites > 0) badge = String(itemCounts.sites)
                    else if (item.href === '/domains' && itemCounts.domains > 0) badge = String(itemCounts.domains)
                    else if (item.href === '/sites' && itemCounts.sites > 0) badge = String(itemCounts.sites)
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
                        key={item.href}
                        to={item.href}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </span>
                        {badge ? (
                          <span
                            className={cn(
                              'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                              isSupport && supportUnread > 0
                                ? 'bg-[#5c4df0] text-white'
                                : 'bg-[#1c1c1f] text-muted-foreground',
                            )}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </NavLink>
                    )
                  })}

                  {isAdmin ? (
                    <NavLink
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                          isActive
                            ? 'bg-[#262629] text-white'
                            : 'text-[#a89cf7] hover:bg-[#1a1a1d] hover:text-white',
                        )
                      }
                      to="/admin"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>Admin</span>
                    </NavLink>
                  ) : null}

                  <button
                    onClick={() => setShowMore(!showMore)}
                    className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-[#1a1a1d] hover:text-white transition duration-150"
                  >
                    <span className="flex items-center gap-3">
                      {showMore ? (
                        <>
                          <ChevronUp className="h-4 w-4 shrink-0" />
                          <span>Show Less</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 shrink-0" />
                          <span>Show More</span>
                        </>
                      )}
                    </span>
                  </button>

                  {showMore && (
                    <>
                      <NavLink
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                            isActive
                              ? 'bg-[#262629] text-white'
                              : 'text-muted-foreground hover:bg-[#1a1a1d] hover:text-white',
                          )
                        }
                        to="/ssl"
                      >
                        <Lock className="h-4 w-4 shrink-0" />
                        <span>SSL</span>
                      </NavLink>
                      <NavLink
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                            isActive
                              ? 'bg-[#262629] text-white'
                              : 'text-muted-foreground hover:bg-[#1a1a1d] hover:text-white',
                          )
                        }
                        to="/dns-zones"
                      >
                        <Globe className="h-4 w-4 shrink-0" />
                        <span>DNS</span>
                      </NavLink>
                    </>
                  )}
                </>
              )}
            </nav>
          </div>

          {/* Help Panel */}
          <div className="p-4 border-t border-[#232328] space-y-3 bg-[#131315] shrink-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
              Let Us Help
            </p>
            <div className="flex items-center gap-2">
              <button className="flex-1 flex justify-center py-2 bg-[#1c1c1f] rounded-md border border-[#2d2d34] hover:bg-[#262629] transition duration-150 text-muted-foreground hover:text-white">
                <MessageSquare className="h-4 w-4" />
              </button>
              <button className="flex-1 flex justify-center py-2 bg-[#1c1c1f] rounded-md border border-[#2d2d34] hover:bg-[#262629] transition duration-150 text-muted-foreground hover:text-white">
                <Mail className="h-4 w-4" />
              </button>
              <button className="flex-1 flex justify-center py-2 bg-[#1c1c1f] rounded-md border border-[#2d2d34] hover:bg-[#262629] transition duration-150 text-muted-foreground hover:text-white">
                <Phone className="h-4 w-4" />
              </button>
            </div>
            <Link
              className="block text-center text-xs text-[#5c4df0] hover:text-[#796ef3] hover:underline transition-colors duration-150"
              to="/support"
            >
              visit the knowledge base
            </Link>
          </div>
        </aside>

        {/* Right Content Pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#121214]">
          {/* Header */}
          <header className="flex items-center justify-between border-b border-[#232328] px-6 py-4 bg-[#121214] shrink-0 text-sm">
            <button
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
              className="mr-3 rounded-md border border-[#2d2d34] p-2 text-white lg:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              type="button"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            {/* Metadata Info */}
            <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground sm:flex">
              <div>
                Client:{' '}
                <span className="text-white font-medium">{clientEmail}</span>
              </div>
              <div className="w-px h-3 bg-[#232328] hidden sm:block" />
              <div>
                Account ID: <span className="text-white font-medium">{accountId ?? '—'}</span>
              </div>
              <div className="w-px h-3 bg-[#232328] hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span>PIN:</span>
                <span className="text-white font-mono font-medium tracking-widest">
                  {showPin ? (supportPin ?? '—') : '••••••'}
                </span>
                <button
                  className="text-muted-foreground hover:text-white transition duration-150"
                  onClick={() => setShowPin(!showPin)}
                >
                  {showPin ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Profile & Admin Actions */}
            <div className="flex items-center gap-3">
              {isAdmin ? (
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-500/20 hover:text-white transition duration-150 shadow-sm"
                >
                  <ShieldCheck className="h-4 w-4 text-violet-400" />
                  <span>Admin Dashboard</span>
                </Link>
              ) : null}

              <Link
                className="flex items-center gap-2 border border-[#2d2d34] bg-[#161619] rounded-md px-3 py-1.5 hover:bg-[#202024] hover:border-[#5c4df0]/50 transition duration-150 select-none"
                to="/profile"
                title="Open Profile Settings"
              >
                {avatarUrl ? (
                  <img
                    alt="User avatar"
                    className="h-5 w-5 rounded-full object-cover"
                    src={avatarUrl}
                  />
                ) : (
                  <div className="h-5 w-5 bg-violet-600/30 border border-violet-500/40 rounded-full flex items-center justify-center text-[10px] font-bold text-violet-300 uppercase">
                    {clientInitials}
                  </div>
                )}
                <span className="text-xs font-semibold text-white">
                  Hi, {clientName}
                </span>
              </Link>
            </div>
          </header>

          {/* Main Area */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Floating support chat — available on every customer page */}
      <ChatWidget />
    </div>
  )
}

