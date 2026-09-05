import { Link } from 'react-router-dom'
import {
  Calendar,
  Sparkles,
} from 'lucide-react'

interface Release {
  version: string
  date: string
  title: string
  description: string
  tag: 'Major Release' | 'Feature Update' | 'Security & Core'
  tagColor: string
  highlights: { title: string; desc: string; type: 'feat' | 'imp' | 'fix' }[]
}

const RELEASES: Release[] = [
  {
    version: 'v2.4.0',
    date: 'September 2026',
    title: 'Multi-Runtime Engine: Node.js, Next.js & PostgreSQL 16',
    description:
      'Maxmark Host is no longer limited to WordPress. Developers can now provision full-stack Node.js and Next.js applications with dedicated PostgreSQL 16 database clusters, automated process supervisors, and zero-downtime rolling deploys.',
    tag: 'Major Release',
    tagColor: 'bg-[#5c4df0]/20 text-[#a89cf7] border-[#5c4df0]/30',
    highlights: [
      {
        title: 'Node.js & Next.js Container Jails',
        desc: 'Isolated execution environments with automatic PM2 process monitoring and WebSocket support.',
        type: 'feat',
      },
      {
        title: 'PostgreSQL 16 Engine Selection',
        desc: 'One-click selection between MySQL 8.0 and PostgreSQL 16 during site provisioning.',
        type: 'feat',
      },
      {
        title: 'Developer Documentation Portal',
        desc: 'Comprehensive developer guides for runtime configurations, database connection strings, and troubleshooting.',
        type: 'feat',
      },
      {
        title: 'Optimized Standalone Image Builder',
        desc: 'Drastically reduced cold-start times for Next.js standalone output bundles.',
        type: 'imp',
      },
    ],
  },
  {
    version: 'v2.3.0',
    date: 'August 2026',
    title: 'Live DNS Zone Editor & BIND Export',
    description:
      'Manage authoritative DNS zones directly from the dashboard with RFC-compliant validation for A, AAAA, CNAME, MX, TXT, and SRV records, plus full standard BIND zone file export.',
    tag: 'Feature Update',
    tagColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    highlights: [
      {
        title: 'Authoritative Nameservers',
        desc: 'Point any domain to ns1.maxmarkhost.com and ns2.maxmarkhost.com for instant live propagation.',
        type: 'feat',
      },
      {
        title: 'BIND Format Export & Download',
        desc: 'Export your complete zone file in standard BIND format to ensure zero vendor lock-in.',
        type: 'feat',
      },
      {
        title: 'Apex & CNAME Validation Guardrails',
        desc: 'Prevents misconfigurations like adding CNAME at root apex or deleting all NS records.',
        type: 'imp',
      },
    ],
  },
  {
    version: 'v2.2.0',
    date: 'July 2026',
    title: 'GitHub CI/CD & Automated Webhook Deploys',
    description:
      'Continuous deployment directly from your code repository. Every git push triggers an ephemeral builder sandbox with automated dependency caching and atomic directory swap.',
    tag: 'Feature Update',
    tagColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    highlights: [
      {
        title: 'Cryptographic Webhook Secrets',
        desc: 'HMAC SHA-256 signature verification guarantees build triggers originate strictly from GitHub.',
        type: 'feat',
      },
      {
        title: 'Branch-Specific Routing',
        desc: 'Deploy production on main while previewing pull requests and feature branches on preview URLs.',
        type: 'imp',
      },
      {
        title: 'Atomic Live Rollout',
        desc: 'If a build or type check fails, the live container is kept running without dropping user traffic.',
        type: 'fix',
      },
    ],
  },
  {
    version: 'v2.1.0',
    date: 'June 2026',
    title: 'Redis Object Caching & Automated Backup Vault',
    description:
      'In-memory object cache acceleration and automated nightly snapshots stored across geographically separated object vaults.',
    tag: 'Security & Core',
    tagColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    highlights: [
      {
        title: 'Redis Object Cache for WordPress',
        desc: 'Pre-configured in-memory caching cutting database read queries by up to 85%.',
        type: 'feat',
      },
      {
        title: 'Point-in-Time Snapshot Restore',
        desc: '14-day and 30-day retention windows with single-click restore of filesystem and databases.',
        type: 'feat',
      },
      {
        title: 'Automated Let’s Encrypt ACME Renewal',
        desc: 'Background daemon checking certificate expiry 30 days prior and renewing with zero interruption.',
        type: 'imp',
      },
    ],
  },
]

export function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#060606] text-white flex flex-col selection:bg-[#5c4df0]/30 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060606]/90 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link className="flex items-center gap-2" to="/">
          <img src="/logo-white.png" alt="Maxmark Host" className="h-6 w-auto" />
          <span className="text-white/20 font-mono text-xs">/</span>
          <span className="text-[#a89cf7] font-mono text-xs font-semibold">changelog</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link className="text-xs text-white/60 hover:text-white transition" to="/docs">
            Documentation
          </Link>
          <Link
            className="text-xs font-semibold bg-[#5c4df0] hover:bg-[#7c6ef4] text-white px-3.5 py-1.5 rounded transition"
            to="/login"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12 space-y-12">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#a89cf7] px-2.5 py-1 rounded bg-[#5c4df0]/10 border border-[#5c4df0]/20">
            <Sparkles className="h-3.5 w-3.5" />
            Platform Evolution
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Changelog & Release Notes</h1>
          <p className="text-sm md:text-base text-white/60 leading-relaxed">
            Stay updated with new runtimes, infrastructure improvements, performance upgrades, and security fixes
            shipped to Maxmark Host.
          </p>
        </div>

        {/* Timeline of Releases */}
        <div className="space-y-10 border-l border-white/10 pl-6 sm:pl-8 ml-2">
          {RELEASES.map((rel, idx) => (
            <article className="relative space-y-4" key={idx}>
              {/* Timeline marker */}
              <div className="absolute -left-[31px] sm:-left-[39px] top-1 h-3.5 w-3.5 rounded-full bg-[#5c4df0] border-4 border-[#060606]" />

              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span className="font-bold text-white text-base">{rel.version}</span>
                <span className="text-white/40">·</span>
                <span className="text-white/50 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> {rel.date}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border ${rel.tagColor}`}>
                  {rel.tag}
                </span>
              </div>

              <h2 className="text-xl font-bold text-white">{rel.title}</h2>
              <p className="text-xs md:text-sm text-white/70 leading-relaxed">{rel.description}</p>

              {/* Highlights cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {rel.highlights.map((h, hIdx) => (
                  <div
                    className="p-3.5 rounded-xl border border-white/10 bg-[#0c0c0e] flex flex-col gap-1"
                    key={hIdx}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                          h.type === 'feat'
                            ? 'bg-[#5c4df0]/20 text-[#a89cf7]'
                            : h.type === 'imp'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {h.type === 'feat' ? 'Feature' : h.type === 'imp' ? 'Improvement' : 'Security'}
                      </span>
                      <span className="text-xs font-semibold text-white truncate">{h.title}</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">{h.desc}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
          <div>Have a feature request or suggestion?</div>
          <Link className="text-[#a89cf7] hover:underline" to="/contact">
            Submit feedback →
          </Link>
        </div>
      </main>
    </div>
  )
}
export default ChangelogPage
