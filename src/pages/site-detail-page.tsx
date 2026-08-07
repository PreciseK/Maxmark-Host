import { useSearchParams, Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  Copy,
  HelpCircle,
  Edit2,
  Lock,
  MoreVertical,
  ArrowUpDown,
  Plus,
  Database,
  Globe,
  CheckCircle2,
  Download,
  ExternalLink,
} from 'lucide-react'

import { MetricChart } from '@/components/site/metric-chart'
import { SettingToggle } from '@/components/site/setting-toggle'
import { useSiteResources } from '@/hooks/use-site-resources'
import { fetchBackupLogs, type BackupLog } from '@/lib/db/backup-logs'
import { latestByMetric } from '@/lib/db/analytics'
import { CONTAINER_TYPES, type ContainerStatus } from '@/lib/db/containers'
import { INTEGRATION_TYPES, type IntegrationStatus } from '@/lib/db/integrations'
import { supabase } from '@/lib/supabase'
import { formatDateLabel } from '@/lib/utils'
import type { ManagedSite } from '@/types/provisioning'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/ui-states'

const containerLabels: Record<(typeof CONTAINER_TYPES)[number], string> = {
  elasticsearch: 'Elasticsearch',
  rabbitmq: 'RabbitMQ',
  solr: 'Solr',
}

/** Presentation copy per container type; status always comes from the database. */
const containerMeta: Record<
  (typeof CONTAINER_TYPES)[number],
  { desc: string; emoji: string; color: string }
> = {
  elasticsearch: {
    desc: 'Elasticsearch is a distributed, RESTful search and analytics engine capable of addressing a growing number of use cases.',
    emoji: '🔍',
    color: 'text-sky-500',
  },
  rabbitmq: {
    desc: 'RabbitMQ is the most widely deployed open source message broker, aiding in process asynchronous queues and background workers.',
    emoji: '🐇',
    color: 'text-amber-500',
  },
  solr: {
    desc: 'Solr is highly reliable, scalable and fault tolerant, providing distributed indexing, replication and load-balanced querying.',
    emoji: '☀️',
    color: 'text-red-500',
  },
}

const integrationLabels: Record<(typeof INTEGRATION_TYPES)[number], string> = {
  new_relic: 'New Relic',
  datadog: 'Datadog',
  cloudflare: 'Cloudflare',
}

/** Presentation copy per integration; status always comes from the database. */
const integrationMeta: Record<
  (typeof INTEGRATION_TYPES)[number],
  { section: string; desc: string; credentialLabel: string }
> = {
  new_relic: {
    section: 'Performance Monitoring',
    desc: "Provide a license key to add New Relic's performance monitoring to your site. This can help in diagnosing performance issues.",
    credentialLabel: 'New Relic License Key',
  },
  datadog: {
    section: 'Observability',
    desc: 'Connect Datadog to forward application and infrastructure metrics from this site to your Datadog account.',
    credentialLabel: 'Datadog API Key',
  },
  cloudflare: {
    section: 'Edge Network',
    desc: 'Connect Cloudflare to manage caching, DNS, and edge protection for this site from your Cloudflare account.',
    credentialLabel: 'Cloudflare API Token',
  },
}

const containerStatusClass: Record<ContainerStatus, string> = {
  enabled: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  provisioning: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  failed: 'border-red-500/30 bg-red-500/10 text-red-400',
  disabled: 'border-white/20 bg-white/5 text-white/70',
}

const integrationStatusClass: Record<IntegrationStatus, string> = {
  enabled: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  disabled: 'border-white/20 bg-white/5 text-white/70',
}

function fmtBackupDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

function backupStatusLabel(status: BackupLog['status']): string {
  if (status === 'in_progress') return 'In Progress'
  if (status === 'failed') return 'Failed'
  return 'Completed'
}

function backupStatusClass(status: BackupLog['status']): string {
  if (status === 'in_progress') return 'border-sky-500/30 bg-sky-500/10 text-sky-400'
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-400'
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
}

interface SiteDetailPageProps {
  sites: ManagedSite[]
}

export function SiteDetailPage({ sites }: SiteDetailPageProps) {
  const { siteId } = useParams()
  const [searchParams] = useSearchParams()
  const site = sites.find((item) => item.id === siteId)
  
  const activeTab = searchParams.get('tab') || 'credentials'
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([])
  const [backupLoadError, setBackupLoadError] = useState(false)
  const {
    resources,
    loading: resourcesLoading,
    error: resourcesError,
    retry: retryResources,
  } = useSiteResources(siteId, activeTab)

  useEffect(() => {
    if (!supabase || !siteId) return
    const sb = supabase
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      fetchBackupLogs(sb, siteId)
        .then(setBackupLogs)
        .catch(() => {
          setBackupLogs([])
          setBackupLoadError(true)
        })
    })
  }, [siteId])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 2000)
  }

  if (!site) {
    return (
      <div className="py-12 max-w-xl mx-auto">
        <ErrorState
          title="Site Not Found"
          message="This WordPress site could not be found or you may no longer have administrative access to it."
          secondaryActionLabel="Back to Sites"
          secondaryActionLink="/sites"
        />
      </div>
    )
  }

  // Define tab headers for breadcrumbs
  const tabTitles: Record<string, string> = {
    credentials: 'Credentials',
    'content-delivery': 'Content Delivery Network',
    backups: 'Backups',
    staging: 'Staging & Dev',
    email: 'Email',
    'visual-comparison': 'Visual Comparison',
    'design-services': 'Design Services',
    analytics: 'Analytics',
    domains: 'Domains',
    management: 'Management',
    databases: 'Databases',
    ssl: 'SSL',
    logs: 'Logs',
    tasks: 'Scheduled Tasks',
    containers: 'Containers',
    integrations: 'Integrations',
  }

  const currentTabTitle = tabTitles[activeTab] || 'Credentials'

  const latestMetrics = latestByMetric(resources.analytics)
  const phpFpmSnapshots = resources.analytics.filter((s) => s.metric === 'php_fpm')
  const webStatsSnapshots = resources.analytics.filter((s) => s.metric === 'web_stats')

  const ftpUsername = `ftp@${site.site_domain.replace(/[^a-z0-9]/g, '').slice(0, 10)}.nxcli.io`

  return (
    <div className="space-y-6">
      {backupLoadError ? <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Backup history could not be loaded.</p> : null}

      {resourcesError ? (
        <ErrorState
          error={resourcesError}
          message={`The ${currentTabTitle} section could not be loaded.`}
          onRetry={retryResources}
          title="Section Unavailable"
        />
      ) : null}
      {resourcesError ? (
        <ErrorState
          title="Site Metrics Error"
          message="We were unable to load live server metrics for this site."
          error={resourcesError}
          onRetry={retryResources}
        />
      ) : null}
      <div className="text-xs text-muted-foreground text-left">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <Link className="hover:text-white transition" to="/plans">
          Plans
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-muted-foreground">WordPress VIP Plan</span>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-muted-foreground">{site.site_domain}</span>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">{currentTabTitle}</span>
      </div>

      {/* Main Header Info Card */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col md:flex-row items-center gap-5">
        {/* Monitor Graphic */}
        <div className="h-16 w-24 border border-[#2d2d34] bg-[#121214] rounded flex items-center justify-center text-muted-foreground shrink-0 relative select-none">
          <svg className="w-12 h-12 text-[#2d2d34]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="2" y="3" width="20" height="13" rx="2" strokeWidth="1.5" />
            <path d="M6 16v3h12v-3" strokeWidth="1.5" />
            <path d="M10 19h4" strokeWidth="1.5" />
            <circle cx="12" cy="9" r="2" strokeWidth="1.5" />
          </svg>
        </div>

        {/* Info Text */}
        <div className="flex-1 text-center md:text-left space-y-2 min-w-0">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
            <h2 className="text-xl font-semibold text-white truncate">{site.site_domain}</h2>
            <button className="text-muted-foreground hover:text-white transition">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                const cleanDomain = site.site_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
                window.open(`https://${cleanDomain}/wp-admin`, '_blank', 'noopener,noreferrer')
              }}
              title="Open WordPress Admin Dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#0073aa] hover:bg-[#005177] text-white text-xs font-semibold transition shadow"
            >
              <span className="font-serif font-bold text-xs">W</span>
              WP-Admin
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <div>
              Type: <span className="text-white font-medium">WordPress</span>
            </div>
            <div className="h-3 w-px bg-[#232328] hidden sm:block" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span>Domain:</span>
              <span className="text-white font-medium truncate">{site.site_domain}</span>
              <button
                onClick={() => handleCopy(site.site_domain)}
                className="text-muted-foreground hover:text-white transition shrink-0"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="h-3 w-px bg-[#232328] hidden sm:block" />
            <div className="flex items-center gap-1.5 min-w-0">
              <span>CNAME Target:</span>
              <span className="text-white font-mono font-medium truncate">{site.cnameTarget}</span>
              <button
                onClick={() => handleCopy(site.cnameTarget)}
                className="text-muted-foreground hover:text-white transition shrink-0"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button className="text-muted-foreground hover:text-white transition shrink-0">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="h-3 w-px bg-[#232328] hidden sm:block" />
            <Link to="/support" className="text-[#5c4df0] hover:text-[#796ef3] hover:underline transition shrink-0 font-medium">
              Looking for an IP address?
            </Link>
          </div>
        </div>
      </div>

      {copiedText && (
        <div className="fixed bottom-5 right-5 bg-[#161619] border border-emerald-500/30 text-emerald-400 text-xs px-4 py-2 rounded-md shadow-lg animate-bounce select-none">
          Copied "{copiedText}" to clipboard
        </div>
      )}

      {/* Tab Specific Content Area */}
      {activeTab === 'credentials' && (
        <div className="space-y-6 text-xs text-left">
          {/* Main Credentials Description */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              If you'd like to provide more control over which files a user can access, you can use an FTP secure account.
              Please ensure that you've configured your FTP client to connect via SSL/TLS with explicit encryption. For
              security purposes, all usernames must include the site's domain as the mail server. However, this email
              address does not need to exist to be set as a username.{' '}
              <Link className="text-[#5c4df0] hover:underline" to="/support">
                Learn More
              </Link>
            </p>

            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[#232328]">
              <div className="flex items-center justify-between bg-[#121214] border border-[#232328] rounded-md p-3">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Hostname</span>
                  <p className="text-white font-mono font-medium truncate">{site.ftpHostname}</p>
                </div>
                <button
                  className="text-muted-foreground hover:text-white p-1"
                  onClick={() => handleCopy(site.ftpHostname)}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between bg-[#121214] border border-[#232328] rounded-md p-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Port</span>
                  <p className="text-white font-mono font-medium flex items-center gap-1.5">
                    21
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  </p>
                </div>
              </div>
            </div>

            {/* FTP Username Table */}
            <div className="border border-[#232328] rounded-md overflow-hidden mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121214] border-b border-[#232328] text-[10px] uppercase text-muted-foreground font-semibold">
                    <th className="px-4 py-2.5">Username</th>
                    <th className="px-4 py-2.5">Home Directory</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#232328] last:border-none font-mono">
                    <td className="px-4 py-3 text-white">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{ftpUsername}</span>
                        <button
                          className="text-muted-foreground hover:text-white shrink-0"
                          onClick={() => handleCopy(ftpUsername)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{site.document_root}</span>
                        <button
                          className="text-muted-foreground hover:text-white shrink-0"
                          onClick={() => handleCopy(site.document_root)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 text-muted-foreground">
                        <button className="hover:text-white">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button className="hover:text-red-400">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Sub Grid for Application, Redis, IP */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Application */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4 text-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <span className="inline-flex h-5 w-5 rounded-full bg-[#0073aa] items-center justify-center text-[10px] font-bold font-serif text-white shrink-0">
                    W
                  </span>
                  Application
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Username</span>
                  <div className="flex items-center justify-between bg-[#121214] border border-[#232328] rounded p-2 text-xs font-mono">
                    <span className="truncate text-white">{site.db_user}</span>
                    <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(site.db_user)}>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Click below to log directly into your WordPress Admin Dashboard. You can also use WordPress's "Forgot Password" feature to reset your admin password if needed.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  className="w-full py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white text-center transition flex items-center justify-center gap-2 shadow"
                  onClick={() => {
                    const cleanDomain = site.site_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
                    window.open(`https://${cleanDomain}/wp-admin`, '_blank', 'noopener,noreferrer')
                  }}
                >
                  <span className="font-serif font-bold text-xs">W</span>
                  Open WP-Admin Dashboard
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                  className="w-full py-1.5 bg-[#202024] hover:bg-[#2c2c32] border border-[#2d2d34] rounded text-[11px] font-medium text-white/80 text-center transition"
                  onClick={() => {
                    const cleanDomain = site.site_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
                    window.open(`http://co-s1.serverpanel.com/~maxmark/${cleanDomain}/wp-admin`, '_blank', 'noopener,noreferrer')
                  }}
                >
                  Staging Temp Login (cPanel Direct)
                </button>
              </div>
            </div>

            {/* Redis */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Database className="h-5 w-5 text-red-500 fill-red-500/10" />
                Redis
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-[#232328]">
                  <span className="text-muted-foreground">Version</span>
                  <span className="text-white font-mono font-semibold flex items-center gap-1">
                    6
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-[#232328]">
                  <span className="text-muted-foreground">IP Address</span>
                  <span className="text-white font-mono font-semibold flex items-center gap-1.5">
                    {site.redisIp ?? '—'}
                    {site.redisIp && (
                      <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(site.redisIp!)}>
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Port</span>
                  <span className="text-white font-mono font-semibold flex items-center gap-1.5">
                    {site.redisPort ?? '—'}
                    {site.redisPort && (
                      <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(String(site.redisPort))}>
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* IP Address */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Globe className="h-5 w-5 text-sky-500" />
                IP Address
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-[#121214] border border-[#232328] rounded p-2 text-xs font-mono">
                  <span className="text-white font-medium">{site.ipAddress}</span>
                  <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(site.ipAddress)}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                  In the event of a migration or high traffic event this IP address may need to change, use CNAMEs to
                  avoid this.{' '}
                  <Link className="text-[#5c4df0] hover:underline" to="/support">
                    For more information please visit this article.
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'content-delivery' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px] text-xs text-left">
          {/* Left Column */}
          <div className="space-y-6">
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                Content Delivery Network
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </h3>
              <p className="text-muted-foreground">
                Content Delivery Network services are included in your plan.{' '}
                <Link className="text-[#5c4df0] hover:underline font-semibold" to="/support">
                  Learn More
                </Link>
              </p>

              {/* Accelerated CDN Graphic */}
              <div className="bg-[#121214] border border-[#232328] rounded-md p-6 flex flex-col items-center justify-center relative select-none max-w-lg mx-auto">
                <div className="flex items-center justify-between w-full max-w-xs relative py-6">
                  {/* Left item: Browser */}
                  <div className="flex flex-col items-center z-10">
                    <div className="h-10 w-10 border border-[#2d2d34] bg-[#161619] rounded flex items-center justify-center text-white text-xs">
                      💻
                    </div>
                    <span className="text-[10px] text-white font-semibold mt-2">Browser</span>
                  </div>

                  {/* SVG connecting arrows */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" fill="none">
                    <line x1="20%" y1="50%" x2="45%" y2="25%" stroke="#2d2d34" strokeWidth="1.5" strokeDasharray="3 3" />
                    <line x1="20%" y1="50%" x2="45%" y2="75%" stroke="#2d2d34" strokeWidth="1.5" strokeDasharray="3 3" />
                    <line x1="55%" y1="25%" x2="80%" y2="50%" stroke="#2d2d34" strokeWidth="1.5" strokeDasharray="3 3" />
                    <line x1="55%" y1="75%" x2="80%" y2="50%" stroke="#2d2d34" strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>

                  {/* Middle upper item: Static assets pointing to cloud */}
                  <div className="flex flex-col items-center z-10 -translate-y-4">
                    <span className="text-[9px] text-muted-foreground uppercase font-semibold mb-1 block">Accelerated delivery</span>
                    <div className="flex gap-1.5 bg-[#161619] border border-[#2d2d34] rounded px-2.5 py-1 text-[10px] text-white">
                      <span>🖼️</span>
                      <span>📂</span>
                      <span>🔊</span>
                    </div>
                  </div>

                  {/* Middle lower item: Everything else */}
                  <div className="flex flex-col items-center z-10 translate-y-4">
                    <span className="text-[9px] text-muted-foreground uppercase font-semibold mb-1 block">Everything else</span>
                    <div className="bg-[#161619] border border-[#2d2d34] rounded px-2.5 py-1 text-[10px] font-mono text-white font-semibold">
                      &lt;/&gt;
                    </div>
                  </div>

                  {/* Right item: Cloudflare/Server */}
                  <div className="flex flex-col items-center z-10">
                    <div className="h-10 w-10 border border-[#2d2d34] bg-[#161619] rounded flex items-center justify-center text-white text-xs">
                      ☁️
                    </div>
                    <span className="text-[10px] text-white font-semibold mt-2">CDN Cloud</span>
                  </div>
                </div>
              </div>

              {/* Data points */}
              <div className="space-y-3 pt-3 border-t border-[#232328] text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-[#232328]">
                  <span className="text-muted-foreground">CDN Hostname</span>
                  <span className="text-white font-mono font-medium flex items-center gap-1.5">
                    {site.cdnHostname ?? '—'}
                    {site.cdnHostname && (
                      <button
                        className="text-muted-foreground hover:text-white"
                        onClick={() => handleCopy(site.cdnHostname!)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-[#232328]">
                  <span className="text-muted-foreground">CDN Endpoint</span>
                  <span className="text-white font-mono font-medium flex items-center gap-1.5">
                    {site.cdnEndpoint ?? '—'}
                    {site.cdnEndpoint && (
                      <button
                        className="text-muted-foreground hover:text-white"
                        onClick={() => handleCopy(site.cdnEndpoint!)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Points To</span>
                  <span className="text-white font-mono font-medium flex items-center gap-1.5">
                    {site.cdnHostname ?? '—'}
                    {site.cdnHostname && (
                      <button
                        className="text-muted-foreground hover:text-white"
                        onClick={() => handleCopy(site.cdnHostname!)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Cloudflare activation section */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Performance Shield powered by Cloudflare</h3>
              
              <div className="bg-[#121214] border border-[#232328] rounded-md p-5 flex flex-col sm:flex-row items-center gap-5">
                {/* Visual */}
                <div className="flex items-center gap-4 shrink-0 select-none bg-[#161619] border border-[#232328] rounded p-4">
                  <span>💻</span>
                  <span>➜</span>
                  <span>☁️</span>
                  <span>➜</span>
                  <span>🖥️</span>
                </div>
                
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <span className="text-[10px] text-white font-bold bg-[#5c4df0]/10 border border-[#5c4df0]/30 px-1.5 py-0.5 rounded inline-block mb-1">
                    Cloudflare WAF Protected
                  </span>
                  <p className="leading-relaxed">
                    Get Cloudflare's speed and security without leaving the Maxmark platform.
                  </p>
                  <p className="leading-relaxed">
                    Starting at $5 per month, Performance Shield prioritizes your network delivery and takes action when a
                    threat is detected. Equipped with Cloudflare's most elite technology, Performance Shield guarantees
                    100% uptime, bot protection, DDoS mitigation, an extra WAF, and enhanced caching.
                  </p>
                </div>
              </div>
              <button className="px-4 py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition">
                Activate Performance Shield
              </button>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Purge Cache</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Clear cached content from Nginx, Varnish, and/or CDN to force updated versions to be pulled from the
                web server. This may temporarily degrade performance on your website.
              </p>
              <button className="w-full py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition">
                Purge Cache
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'backups' && (
        <div className="space-y-6 text-xs text-left">
          {/* Backups logs Card */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden flex flex-col justify-between">
            <div className="px-5 py-4 border-b border-[#232328]">
              <h3 className="text-sm font-semibold text-white">Backup Records</h3>
            </div>

            {backupLogs.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  badge="Automated Snapshots"
                  icon={<Database className="h-7 w-7 text-violet-400" />}
                  title="No Backups Recorded"
                  description="Daily automated backup snapshots and on-demand manual backups will appear here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                      <th className="px-5 py-3 font-semibold">
                        <button className="flex items-center gap-1.5 hover:text-white transition">
                          Date & Time
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-white">
                    {backupLogs.map((log) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={log.id}>
                        <td className="px-5 py-3.5 font-medium">{fmtBackupDate(log.createdAt)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex border px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${backupStatusClass(log.status)}`}>
                            {backupStatusLabel(log.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <button className="text-muted-foreground hover:text-white transition">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Warning info block */}
            <div className="p-4 border-t border-[#232328] bg-[#121214] text-center text-muted-foreground text-xs leading-relaxed">
              Your site is backed up daily. To restore from an earlier backup, please{' '}
              <Link className="text-[#5c4df0] hover:underline font-semibold" to="/support">
                contact support
              </Link>
              .
            </div>
          </div>
        </div>
      )}

      {activeTab === 'staging' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px] text-xs text-left">
          {/* Left Column */}
          <div className="space-y-6">
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-[#232328] pb-4">
                <h3 className="text-sm font-semibold text-white">Dev Environments</h3>
                <button className="p-1 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-muted-foreground hover:text-white transition">
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {resourcesLoading ? (
                <TableSkeleton rows={2} />
              ) : resources.staging.length === 0 ? (
                <div className="border border-dashed border-[#2d2d34] rounded-lg p-10 flex flex-col items-center justify-center text-center space-y-4 bg-[#121214]">
                  <div className="h-10 w-10 bg-[#161619] border border-[#2d2d34] rounded-full flex items-center justify-center text-muted-foreground select-none">
                    🧪
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">There are no development environments for this site.</h4>
                    <p className="text-muted-foreground text-xs">Create your first development environment.</p>
                  </div>
                  <button className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] font-semibold text-white transition text-xs">
                    Add Development Environment
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                      <th className="px-5 py-2.5">Environment</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-white">
                    {resources.staging.map((env) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={env.id}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{env.siteDomain}</span>
                            <button
                              className="text-muted-foreground hover:text-white"
                              onClick={() => handleCopy(env.siteDomain)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex border border-[#2d2d34] bg-[#121214] px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize">
                            {env.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">
                          {formatDateLabel(env.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Column KB Links */}
          <div className="space-y-6">
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Knowledge Base Links</h3>
              <div className="space-y-2.5 pt-1 text-xs">
                <Link className="block text-white hover:text-[#5c4df0] underline transition duration-150" to="/support">
                  Mwx Staging Site Create KB
                </Link>
                <Link className="block text-white hover:text-[#5c4df0] underline transition duration-150" to="/support">
                  Development Environment KB
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'domains' && (
        <div className="space-y-6 text-xs text-left">
          {/* Modify Master Domain */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h3 className="text-sm font-semibold text-white">Modify Master Domain</h3>
              <p className="text-muted-foreground leading-relaxed">
                Change your current master domain name to a new value. We recommend ONLY doing this when you are ready to point your DNS. If you are not ready to point your DNS, please hold on this step to prevent unexpected behavior with your site and application admin availability.
              </p>
            </div>
            <button className="px-4 py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition shrink-0">
              Modify Master Domain
            </button>
          </div>

          {/* Pointer Domains */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Pointer Domains</h3>
              <button className="p-1 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-muted-foreground hover:text-white transition">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 border-b border-[#232328] text-muted-foreground bg-[#121214]">
              Designate a pointer domain, which will redirect visitors from that domain to your master domain. To point your live domain to this site, add an Alias/CNAME record.
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                  <th className="px-5 py-2.5">Domain</th>
                  <th className="px-5 py-2.5">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-white">
                {resources.pointerDomains.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-muted-foreground" colSpan={2}>
                      {resourcesLoading
                        ? 'Loading pointer domains…'
                        : 'No pointer domains are configured for this site.'}
                    </td>
                  </tr>
                ) : (
                  resources.pointerDomains.map((pointer) => (
                    <tr className="hover:bg-[#1c1c20] transition" key={pointer.id}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{pointer.domain}</span>
                          <button
                            className="text-muted-foreground hover:text-white"
                            onClick={() => handleCopy(pointer.domain)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground capitalize">{pointer.type}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'design-services' && (
        <div className="grid gap-6 md:grid-cols-2 text-xs text-left">
          {/* Design Services */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                Design Services
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Activate Design Services now and our professionals will create a turnkey WordPress website that's 100% unique to your business. We collaborate with you closely to launch a highly-customized WordPress website that perfectly aligns with your vision.{' '}
                <Link className="text-[#5c4df0] hover:underline" to="/support">
                  Learn more.
                </Link>
              </p>
            </div>
            <button className="w-full py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition text-center">
              Activate Design Services
            </button>
          </div>

          {/* SiteKeep */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                SiteKeep
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Activate SiteKeep now to keep your site running like a dream. SiteKeep is a monthly service that professionally monitors, maintains, and optimizes your website around the clock, so you can spend more time building your business.
              </p>
            </div>
            <button className="w-full py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition text-center">
              Activate SiteKeep
            </button>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr] text-xs text-left">
          {/* Left Column - Bandwidth & Auto Scaling */}
          <div className="space-y-6">
            {/* Bandwidth */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Bandwidth</h3>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Latest Recorded Usage</span>
                <span className="text-white font-semibold">
                  {latestMetrics.bandwidth === null
                    ? resourcesLoading
                      ? '…'
                      : 'No data yet'
                    : `${latestMetrics.bandwidth.toLocaleString()} GB`}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Sourced from the most recent bandwidth snapshot recorded for this site.
              </p>
            </div>
          </div>

          {/* Right Column - Charts */}
          <div className="space-y-6">
            {/* PHP-FPM CPU Chart */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">PHP-FPM</h3>
                {/* Legend */}
                <div className="flex items-center gap-4 text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-[#d97706] rounded-sm"></span>
                    <span className="text-muted-foreground">In</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-[#3b82f6] rounded-sm"></span>
                    <span className="text-muted-foreground">Out</span>
                  </div>
                </div>
              </div>

              <MetricChart
                barClassName="bg-[#d97706]/80 hover:bg-[#d97706]"
                height="h-60"
                loading={resourcesLoading}
                snapshots={phpFpmSnapshots}
              />
              <div className="text-center text-[10px] text-muted-foreground">Total Processes</div>
            </div>

            {/* Web Statistics - Second FPM Chart */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#232328] pb-3">
                <h3 className="text-sm font-semibold text-white">Web Statistics</h3>
                <span className="text-[10px] bg-[#232328] px-2 py-0.5 rounded text-muted-foreground uppercase font-bold">Beta</span>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-white">Requests</h4>
                <MetricChart
                  barClassName="bg-[#3b82f6]/60 hover:bg-[#3b82f6]"
                  height="h-40"
                  loading={resourcesLoading}
                  snapshots={webStatsSnapshots}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'visual-comparison' && (
        <div className="space-y-6 text-xs text-left">
          {/* Visual Comparison Card */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Visual Comparison</h3>
            <p className="text-muted-foreground leading-relaxed">
              To toggle on or off core or plugin updates, please visit the Management section. Occasionally, updating a plugin can cause major changes to the appearance or behavior of your site. We don't like that kind of surprise around here, so we perform a visual regression test on key pages of your site.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Before upgrading anything on a live site, we create a copy of the site, then take screenshots before and after the plugin update. If anything has changed, we hold the update to give you the chance to review it yourself. Visual Comparison runs about every 4 days.
            </p>
            <Link className="text-[#5c4df0] hover:underline font-semibold block pt-1" to="/support">
              Learn More
            </Link>
          </div>

          {/* Upgrades */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Upgrades</h3>
            <div className="border border-dashed border-[#2d2d34] rounded-lg p-10 flex flex-col items-center justify-center text-center space-y-3 bg-[#121214]">
              <div className="h-10 w-10 bg-[#161619] border border-[#2d2d34] rounded-full flex items-center justify-center text-muted-foreground select-none">
                📸
              </div>
              <h4 className="text-sm font-bold text-white">There's nothing to show (yet)!</h4>
              <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">
                Before we update plugins, we spin up a separate copy of your site, take screenshots of key pages, perform the updates in our sandbox, and make sure nothing has visually changed. If anything looks funny, we'll let you know so you can approve the change before we make the update.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'email' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] text-xs text-left">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Local Mail Delivery */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Local Mail Delivery</h3>
                {/* Switch Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Deliver Mail Locally</span>
                  <SettingToggle
                    enabled={resources.settings?.localMailDelivery}
                    label="Deliver mail locally"
                  />
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Local Delivery should only be disabled for a domain if e-mail for that domain is hosted by an external mail service and not this server. With Local Delivery disabled, all email boxes, aliases, groups, and autoresponders configured for this domain on this server will not be active.
              </p>
            </div>

            {/* Email Boxes */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Email Boxes</h3>
                <button className="p-1 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-muted-foreground hover:text-white transition">
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                    <th className="px-5 py-2.5">Name</th>
                    <th className="px-5 py-2.5">Storage</th>
                    <th className="px-5 py-2.5">Hostname</th>
                    <th className="px-5 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-white">
                  {resources.emailBoxes.length === 0 ? (
                    <tr>
                      <td className="px-5 py-6 text-muted-foreground" colSpan={4}>
                        {resourcesLoading
                          ? 'Loading email boxes…'
                          : 'No email boxes have been created for this site.'}
                      </td>
                    </tr>
                  ) : (
                    resources.emailBoxes.map((box) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={box.id}>
                        <td className="px-5 py-4 font-mono font-medium">
                          <div className="flex items-center gap-1.5">
                            <span>{box.emailAddress}</span>
                            <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(box.emailAddress)}>
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {box.storageQuotaMb === null ? 'Unlimited' : `${box.storageQuotaMb} MB`}
                        </td>
                        <td className="px-5 py-4 font-mono text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span>{box.hostname}</span>
                            <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(box.hostname)}>
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <button className="text-muted-foreground hover:text-white">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Email Aliases */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Email Aliases</h3>
                <button className="p-1 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-muted-foreground hover:text-white transition">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {resources.emailAliases.length === 0 ? (
                <div className="border border-dashed border-[#2d2d34] rounded-lg m-5 p-10 flex flex-col items-center justify-center text-center space-y-2 bg-[#121214]">
                  <div className="h-8 w-8 bg-[#161619] border border-[#2d2d34] rounded-full flex items-center justify-center text-muted-foreground select-none">
                    📧
                  </div>
                  <h4 className="text-xs font-bold text-white">
                    {resourcesLoading
                      ? 'Loading email aliases…'
                      : 'There are no email aliases for this host.'}
                  </h4>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                      <th className="px-5 py-2.5">Alias</th>
                      <th className="px-5 py-2.5">Forwards To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-white">
                    {resources.emailAliases.map((alias) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={alias.id}>
                        <td className="px-5 py-4 font-mono font-medium">
                          <div className="flex items-center gap-1.5">
                            <span>{alias.aliasAddress}</span>
                            <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(alias.aliasAddress)}>
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-muted-foreground">
                          {alias.targetAddress}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Webmail */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Webmail</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Access your mailbox securely from any web browser using Maxmark webmail.
              </p>
              <button className="w-full py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition">
                Launch Webmail
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ssl' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] text-xs text-left">
          {/* Left Column */}
          <div className="space-y-6">
            {/* SSL Certificate Status */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">SSL Certificate Status</h3>
              {resourcesLoading && !resources.ssl ? (
                <p className="text-muted-foreground">Loading certificate details…</p>
              ) : !resources.ssl || resources.ssl.status === 'not_installed' ? (
                <>
                  <p className="text-muted-foreground leading-relaxed">
                    No SSL certificate is installed for this site yet. Enable Auto Let's
                    Encrypt to have one provisioned and renewed automatically.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-lg font-bold text-white leading-none">Not Installed</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground leading-relaxed">
                    {resources.ssl.status === 'pending'
                      ? 'A certificate has been requested and is pending issuance.'
                      : 'An SSL certificate is installed. See below for the certificate details.'}
                  </p>

                  <div className="flex items-center gap-3 pt-1">
                    {resources.ssl.status === 'installed' && (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500 fill-emerald-500/10 shrink-0" />
                    )}
                    <span className="text-lg font-bold text-white leading-none capitalize">
                      {resources.ssl.status === 'installed' ? 'Installed' : 'Pending'}
                    </span>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-[#232328] text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-[#232328]">
                      <span className="text-muted-foreground">Domain</span>
                      <span className="text-white font-mono font-medium flex items-center gap-1.5">
                        {resources.ssl.domain}
                        <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(resources.ssl!.domain)}>
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-[#232328]">
                      <span className="text-muted-foreground">Expiration Date</span>
                      <span className="text-white font-semibold">
                        {resources.ssl.expiresAt ? formatDateLabel(resources.ssl.expiresAt) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Key Length</span>
                      <span className="text-white font-semibold">{resources.ssl.keyLength} bits</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] font-semibold text-white transition text-xs">
                      Uninstall
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Auto Let's Encrypt Certificate */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#232328] pb-3">
                <h3 className="text-sm font-semibold text-white">Auto Let's Encrypt Certificate</h3>
              </div>

              {/* Master toggle */}
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">Enable</span>
                <SettingToggle
                  enabled={resources.settings?.autoLetsEncrypt}
                  label="Auto Let's Encrypt certificate"
                />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Let us take care of SSL for you! We will install a Let's Encrypt certificate and automatically renew it for you.
              </p>
              
              <div className="space-y-3 pt-1 text-xs">
                <p className="text-muted-foreground font-medium">
                  In addition to your primary domain, please select which domains you'd like to include on the certificate from the list below.
                </p>
                
                {/* Domain list with toggles */}
                <div className="space-y-3 pt-2">
                  {[site.site_domain, `www.${site.site_domain}`].map((domain) => (
                    <div className="flex items-center justify-between" key={domain}>
                      <span className="text-white">{domain}</span>
                      <SettingToggle
                        enabled={resources.ssl?.domainsIncluded.includes(domain) ?? false}
                        label={`Include ${domain} on the certificate`}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button className="flex-1 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-[10px] font-bold text-white text-center transition">
                  Refresh Domains List
                </button>
                <button className="flex-1 py-2 bg-[#26262b] rounded text-[10px] font-bold text-muted-foreground text-center cursor-not-allowed" disabled>
                  Issue Certificate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'databases' && (
        <div className="space-y-6 text-xs text-left">
          {/* phpMyAdmin & Quick Add */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">phpMyAdmin</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Click this button to launch the phpMyAdmin panel. From this control panel you can perform operations on your database from your browser.
                </p>
              </div>
              <button className="w-full py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition text-center">
                Launch phpMyAdmin
              </button>
            </div>

            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">Quick Add Database & User</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Automatically generate a database name, user credentials, and associate them with a single click.
                </p>
              </div>
              <button className="w-full py-2.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition text-center">
                Add Database & User
              </button>
            </div>
          </div>

          {/* Databases list table */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Databases</h3>
              <button className="p-1 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-muted-foreground hover:text-white transition">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">Endpoint</th>
                  <th className="px-5 py-2.5">Storage Used</th>
                  <th className="px-5 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-white">
                <tr className="hover:bg-[#1c1c20] transition">
                  <td className="px-5 py-4 font-mono font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{site.db_name}</span>
                      <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(site.db_name)}>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span>localhost</span>
                      <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy('localhost')}>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4">{site.metrics.diskUsedGb.toFixed(2)} GB</td>
                  <td className="px-5 py-4">
                    <button className="text-muted-foreground hover:text-white">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Users list table */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Users</h3>
              <button className="p-1 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-muted-foreground hover:text-white transition">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">Databases</th>
                  <th className="px-5 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-white">
                <tr className="hover:bg-[#1c1c20] transition">
                  <td className="px-5 py-4 font-mono font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{site.db_user}</span>
                      <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(site.db_user)}>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span>{site.db_name}</span>
                      <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(site.db_name)}>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button className="text-muted-foreground hover:text-white">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'management' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] text-xs text-left">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Core Upgrades */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Core Upgrades</h3>
                <SettingToggle
                  enabled={resources.settings?.coreUpgrades}
                  label="Core upgrades"
                />
              </div>
              <p className="text-muted-foreground leading-relaxed">
                If you turn off Core Updates, you will pause WordPress Core updates for 90 days. Turn off with caution, as your site may become susceptible to attack.
              </p>
            </div>

            {/* Cloud Accelerator */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold rounded font-mono select-none">N</span>
                  <h3 className="text-sm font-semibold text-white">NGINX Accelerator</h3>
                </div>
                <SettingToggle
                  enabled={resources.settings?.nginxAccelerator}
                  label="NGINX accelerator"
                />
              </div>
              <p className="text-muted-foreground leading-relaxed">
                NGINX accelerates content and application delivery. The NGINX Cache is a micro-cache that compresses and stores static content in-memory for short periods of time.
              </p>
            </div>

            {/* PHP Configuration */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">PHP</h3>
              <div className="space-y-3 pt-1 text-xs">
                <div className="flex justify-between items-center pb-2.5 border-b border-[#232328]">
                  <span className="text-muted-foreground">Version</span>
                  <span className="text-white font-mono font-semibold flex items-center gap-1">
                    {site.phpVersion}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2.5">
                  <span className="text-muted-foreground">Location</span>
                  <span className="text-white font-mono flex items-center gap-1.5">
                    /opt/remi/php{site.phpVersion.replace('.', '')}/root/usr/bin/php
                    <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy(`/opt/remi/php${site.phpVersion.replace('.', '')}/root/usr/bin/php`)}>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </div>
              
              <div className="pt-2">
                <button className="px-4 py-2.5 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] font-semibold text-white transition text-xs">
                  Change PHP Version
                </button>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Password Protection */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Password Protection</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You can require visitors to have a password to view your site. This can be especially useful during site development.
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground">
                  {resources.settings?.passwordProtection ? 'Currently enabled' : 'Currently disabled'}
                </span>
                <button className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition">
                  {resources.settings?.passwordProtection ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>

            {/* Auto Scaling Notification Alert Details */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Auto Scaling Usage Details</h3>
              <div className="space-y-3 pt-1 text-xs">
                <p className="text-muted-foreground">You will receive the following email notifications:</p>
                <ul className="space-y-2 text-white list-disc list-inside pl-1">
                  <li>Scaling begins</li>
                  <li>Scaling has been active for 12 hours</li>
                  <li>Scaling has been active for 24 hours and you will begin to incur charges</li>
                </ul>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-[#232328]">
                  If you have questions about auto scaling or require additional assistance with your site's resources, please contact us.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-6 text-xs text-left">
          {/* Logs table download list */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden flex flex-col justify-between">
            <div className="px-5 py-4 border-b border-[#232328]">
              <h3 className="text-sm font-semibold text-white">Log Files</h3>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                    <th className="px-5 py-3 font-semibold">Log File</th>
                    <th className="px-5 py-3 font-semibold">Modified Date</th>
                    <th className="px-5 py-3 w-28"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-white">
                  {[
                    { name: `access-fpm-php81-slow.log`, time: 'Mar 1, 2026 5:11 AM' },
                    { name: `nginx-error.log`, time: 'Mar 1, 2026 5:12 AM' },
                    { name: `access.log`, time: 'Mar 1, 2026 5:12 AM' },
                    { name: `php-error.log`, time: 'Mar 1, 2026 5:12 AM' },
                    { name: `cron-fpm.log`, time: 'Mar 1, 2026 5:13 AM' },
                    { name: `mysql-slow.log`, time: 'Mar 1, 2026 5:13 AM' },
                    { name: `security.log`, time: 'Mar 1, 2026 5:14 AM' },
                    { name: `object-cache.log`, time: 'Mar 1, 2026 5:15 AM' },
                  ].map((log, idx) => (
                    <tr className="hover:bg-[#1c1c20] transition" key={idx}>
                      <td className="px-5 py-3.5 font-mono font-medium">{log.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{log.time}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-white transition text-[10px] font-bold">
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-6 text-xs text-left">
          {/* General Options */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-4">General Options</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
              <div className="space-y-3 flex-1 w-full max-w-xl">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">Path</span>
                  <div className="flex items-center justify-between bg-[#121214] border border-[#232328] rounded p-2 text-xs font-mono">
                    <span className="text-white font-medium">/usr/local/bin:/usr/bin</span>
                    <button className="text-muted-foreground hover:text-white" onClick={() => handleCopy('/usr/local/bin:/usr/bin')}>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">Mail To</span>
                  <input
                    type="email"
                    className="w-full bg-[#121214] border border-[#232328] rounded p-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors"
                    defaultValue={resources.settings?.cronMailTo ?? ''}
                    key={resources.settings?.cronMailTo ?? 'no-mail-to'}
                    placeholder="Enter email address"
                  />
                </div>
              </div>
              <button className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition shrink-0">
                Update
              </button>
            </div>
          </div>

          {/* Tasks table */}
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Tasks</h3>
              <button className="p-1 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-muted-foreground hover:text-white transition">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            
            {resources.cronTasks.length === 0 ? (
              <div className="border border-dashed border-[#2d2d34] rounded-lg m-5 p-10 flex flex-col items-center justify-center text-center space-y-3 bg-[#121214]">
                <h4 className="text-sm font-bold text-white">
                  {resourcesLoading ? 'Loading tasks…' : 'All Clear!'}
                </h4>
                {!resourcesLoading && (
                  <>
                    <p className="text-muted-foreground text-xs">You don't have any tasks yet.</p>
                    <button className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] font-semibold text-white transition text-xs">
                      Add Task
                    </button>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#232328] text-[10px] uppercase text-muted-foreground bg-[#121214] font-semibold">
                    <th className="px-5 py-2.5">Command</th>
                    <th className="px-5 py-2.5">Schedule</th>
                    <th className="px-5 py-2.5">Mail To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232328] text-white">
                  {resources.cronTasks.map((task) => (
                    <tr className="hover:bg-[#1c1c20] transition" key={task.id}>
                      <td className="px-5 py-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-md">{task.command}</span>
                          <button
                            className="text-muted-foreground hover:text-white shrink-0"
                            onClick={() => handleCopy(task.command)}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-muted-foreground">{task.schedule}</td>
                      <td className="px-5 py-4 text-muted-foreground">{task.mailTo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'containers' && (
        <div className="space-y-6 text-xs text-left">
          {CONTAINER_TYPES.map((type) => {
            const meta = containerMeta[type]
            // Absent row means the service was never provisioned for this site.
            const status = resources.containers.find((c) => c.containerType === type)?.status ?? 'disabled'
            return (
              <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 flex flex-col sm:flex-row items-center justify-between gap-4" key={type}>
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className={`text-2xl shrink-0 ${meta.color}`}>{meta.emoji}</span>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{containerLabels[type]}</h3>
                      <span
                        className={`inline-flex border px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${containerStatusClass[status]}`}
                      >
                        {status}
                      </span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed truncate max-w-xl sm:max-w-2xl lg:max-w-3xl">
                      {meta.desc}
                    </p>
                  </div>
                </div>
                <button
                  className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition shrink-0 disabled:cursor-not-allowed disabled:bg-[#26262b] disabled:text-muted-foreground"
                  disabled={status === 'provisioning'}
                >
                  {status === 'enabled' ? 'Disable' : status === 'provisioning' ? 'Provisioning…' : 'Enable'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="space-y-6 text-xs text-left">
          {INTEGRATION_TYPES.map((type) => {
            const meta = integrationMeta[type]
            // Absent row means the integration was never configured for this site.
            const status = resources.integrations.find((i) => i.type === type)?.status ?? 'disabled'
            return (
              <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4" key={type}>
                <h3 className="text-sm font-semibold text-white">{meta.section}</h3>
                <div className="border-t border-[#232328] pt-4 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
                  <div className="space-y-3 flex-1 w-full max-w-xl">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-white">{integrationLabels[type]}</h4>
                        <span
                          className={`inline-flex border px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${integrationStatusClass[status]}`}
                        >
                          {status}
                        </span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{meta.desc}</p>
                    </div>
                    <div className="pt-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                        {meta.credentialLabel}
                      </span>
                      <input
                        type="password"
                        className="w-full bg-[#121214] border border-[#232328] rounded p-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors font-mono"
                        placeholder="••••••••••••••••••••••••••••••••"
                      />
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-xs font-semibold text-white transition shrink-0">
                    {status === 'enabled' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Placeholders for un-implemented sub-tabs */}
      {activeTab !== 'credentials' &&
        activeTab !== 'content-delivery' &&
        activeTab !== 'backups' &&
        activeTab !== 'staging' &&
        activeTab !== 'domains' &&
        activeTab !== 'design-services' &&
        activeTab !== 'analytics' &&
        activeTab !== 'visual-comparison' &&
        activeTab !== 'email' &&
        activeTab !== 'ssl' &&
        activeTab !== 'databases' &&
        activeTab !== 'management' &&
        activeTab !== 'logs' &&
        activeTab !== 'tasks' &&
        activeTab !== 'containers' &&
        activeTab !== 'integrations' && (
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-10 text-center space-y-4 text-xs text-left max-w-xl mx-auto">
            <div className="h-10 w-10 bg-[#121214] border border-[#232328] rounded-full flex items-center justify-center mx-auto text-muted-foreground select-none">
              ⚙️
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">{currentTabTitle} Management</h3>
              <p className="text-muted-foreground leading-relaxed">
                This environment subsystem is ready for the next iteration. Operations such as configuring{' '}
                {currentTabTitle.toLowerCase()} will slot directly into this dark portal panel.
              </p>
            </div>
            <Link
              to="/plans"
              className="inline-block px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-white transition font-semibold"
            >
              Back to dashboard
            </Link>
          </div>
        )}
    </div>
  )
}
