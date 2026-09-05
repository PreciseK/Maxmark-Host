import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CheckCircle2,
  Globe,
  RefreshCw,
} from 'lucide-react'

interface ServiceComponent {
  name: string
  description: string
  status: 'operational' | 'degraded' | 'maintenance'
  uptimePercent: number
  category: string
}

const COMPONENTS: ServiceComponent[] = [
  {
    name: 'Anycast DNS & Edge Network',
    description: 'ns1.maxmarkhost.com & ns2 authoritative nameservers, global DDoS filtering',
    status: 'operational',
    uptimePercent: 99.99,
    category: 'Edge Infrastructure',
  },
  {
    name: 'Managed Compute & Containers',
    description: 'Process supervisor, PHP-FPM, Node.js and Next.js isolated jails',
    status: 'operational',
    uptimePercent: 99.98,
    category: 'Compute Runtimes',
  },
  {
    name: 'Managed MySQL 8.0 Clusters',
    description: 'High-availability relational database nodes, automated replication',
    status: 'operational',
    uptimePercent: 100,
    category: 'Database Engines',
  },
  {
    name: 'Managed PostgreSQL 16 Clusters',
    description: 'ACID transaction instances, connection poolers, SSL endpoints',
    status: 'operational',
    uptimePercent: 100,
    category: 'Database Engines',
  },
  {
    name: 'GitHub CI/CD & Webhook Engine',
    description: 'HMAC signature verification, automated sandbox builder and atomic deploys',
    status: 'operational',
    uptimePercent: 99.95,
    category: 'Deployment Pipelines',
  },
  {
    name: 'Backup Engine & Snapshot Vault',
    description: 'Nightly incremental filesystem snapshots and offsite object storage retention',
    status: 'operational',
    uptimePercent: 100,
    category: 'Storage & Security',
  },
  {
    name: 'SSL & TLS Automation Engine',
    description: 'Let’s Encrypt ACME verification and automated renewal services',
    status: 'operational',
    uptimePercent: 100,
    category: 'Security & Certs',
  },
]

const REGIONS = [
  { region: 'Lagos Edge (LOS)', latency: '12ms', status: 'Optimal' },
  { region: 'London Core (LON)', latency: '28ms', status: 'Optimal' },
  { region: 'Frankfurt Core (FRA)', latency: '34ms', status: 'Optimal' },
  { region: 'Johannesburg Edge (JNB)', latency: '39ms', status: 'Optimal' },
  { region: 'New York Transit (NYC)', latency: '78ms', status: 'Optimal' },
]

export function StatusPage() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastChecked, setLastChecked] = useState('Just now')

  function handleRefresh() {
    setIsRefreshing(true)
    setTimeout(() => {
      setIsRefreshing(false)
      setLastChecked('Just now')
    }, 600)
  }

  return (
    <div className="min-h-screen bg-[#060606] text-white flex flex-col selection:bg-[#5c4df0]/30 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060606]/90 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link className="flex items-center gap-2" to="/">
          <img src="/logo-white.png" alt="Maxmark Host" className="h-6 w-auto" />
          <span className="text-white/20 font-mono text-xs">/</span>
          <span className="text-[#a89cf7] font-mono text-xs font-semibold">status</span>
        </Link>
        <div className="flex items-center gap-4">
          <button
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition px-2.5 py-1 rounded bg-white/5 hover:bg-white/10"
            disabled={isRefreshing}
            onClick={handleRefresh}
            type="button"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-[#a89cf7]' : ''}`} />
            <span>{isRefreshing ? 'Checking...' : 'Refresh'}</span>
          </button>
          <Link
            className="text-xs font-semibold bg-[#5c4df0] hover:bg-[#7c6ef4] text-white px-3.5 py-1.5 rounded transition"
            to="/login"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 space-y-10">
        {/* Banner */}
        <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">All Systems Operational</h1>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Every service, container node, and edge proxy is operating within nominal parameters.
              </p>
            </div>
          </div>
          <div className="text-right font-mono text-xs text-white/40">
            <div>Updated: {lastChecked}</div>
            <div className="text-emerald-400 text-[11px] font-semibold">99.98% 90-Day Uptime</div>
          </div>
        </div>

        {/* 90-day Uptime Visualization */}
        <div className="p-6 rounded-xl border border-white/10 bg-[#0c0c0e] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#a89cf7]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                System Availability (Past 90 Days)
              </h2>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-semibold">99.98% Average</span>
          </div>

          <div className="grid grid-cols-30 sm:grid-cols-45 md:grid-cols-90 gap-1 pt-2">
            {Array.from({ length: 90 }).map((_, i) => (
              <div
                className="h-8 rounded-[2px] bg-emerald-500/80 hover:bg-emerald-400 transition cursor-pointer"
                key={i}
                title={`Day ${90 - i}: 100% Operational`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-white/40 pt-1">
            <span>90 days ago</span>
            <span>Today (100% availability)</span>
          </div>
        </div>

        {/* Service Components Breakdown */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 font-mono">
            Platform Service Breakdown
          </h2>
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c0c0e] overflow-hidden">
            {COMPONENTS.map((service, idx) => (
              <div
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition"
                key={idx}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-white">{service.name}</span>
                    <span className="text-[10px] font-mono text-white/40 uppercase px-2 py-0.5 rounded bg-white/5 border border-white/5">
                      {service.category}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">{service.description}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 sm:text-right font-mono text-xs">
                  <span className="text-white/40">{service.uptimePercent}%</span>
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Operational</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Global Edge Latency */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#a89cf7]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 font-mono">
              Regional Edge Point of Presence (PoP)
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {REGIONS.map((region, idx) => (
              <div
                className="p-4 rounded-lg border border-white/10 bg-[#0c0c0e] flex items-center justify-between"
                key={idx}
              >
                <div>
                  <div className="text-xs font-semibold text-white">{region.region}</div>
                  <div className="text-[11px] text-white/40 font-mono mt-0.5">Latency: {region.latency}</div>
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {region.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Incident History */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 font-mono">
            Past Incidents & Maintenance
          </h2>
          <div className="p-5 rounded-xl border border-white/10 bg-[#0c0c0e] space-y-4">
            <div className="border-b border-white/10 pb-4">
              <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-1">
                <span>September 01, 2026</span>
                <span className="text-emerald-400 font-semibold">Completed Maintenance</span>
              </div>
              <h3 className="text-sm font-semibold text-white">
                Scheduled Kernel Patch & PostgreSQL 16.4 Engine Upgrade
              </h3>
              <p className="text-xs text-white/60 mt-1 leading-relaxed">
                Applied zero-downtime kernel live-patches and updated core database execution nodes in the Frankfurt
                and Lagos regions. All sites remained accessible without request dropped.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-1">
                <span>August 18, 2026</span>
                <span className="text-emerald-400 font-semibold">Resolved</span>
              </div>
              <h3 className="text-sm font-semibold text-white">Upstream Transit Fiber Jitter (London PoP)</h3>
              <p className="text-xs text-white/60 mt-1 leading-relaxed">
                Transient upstream BGP routing divergence caused higher latency for roughly 4 minutes. Anycast edge
                automatically rerouted traffic through the Amsterdam and Frankfurt nodes.
              </p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div>Incident reports are published in real-time. For urgent matters, contact emergency NOC support.</div>
          <Link className="text-[#a89cf7] hover:underline" to="/contact">
            Contact Support & SLA
          </Link>
        </div>
      </main>
    </div>
  )
}
export default StatusPage
