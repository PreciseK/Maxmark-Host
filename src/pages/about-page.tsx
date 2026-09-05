import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  HardDrive,
  HelpCircle,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
  category: string
}

const FAQS: FAQItem[] = [
  {
    category: 'Platform & Runtimes',
    question: 'Can I run WordPress, Node.js, and Next.js applications on the same account?',
    answer:
      'Yes. Maxmark Host provides multi-runtime support. Depending on your plan (Launch, Pro, or Scale), each site you create can run its own dedicated runtime environment — whether that is Managed WordPress (PHP 8.2/8.3 with OPcache), Node.js, Next.js (SSR or standalone), or a static HTML/Vite application.',
  },
  {
    category: 'Deployment & CI/CD',
    question: 'How does automated GitHub CI/CD auto-deployment work?',
    answer:
      'When you connect your GitHub repository to a site, Maxmark generates a cryptographically signed HMAC SHA-256 webhook. Whenever you push new commits to your configured branch (e.g. main), Maxmark automatically pulls the code, installs dependencies in an isolated sandbox, compiles assets, and performs an atomic directory swap with zero downtime.',
  },
  {
    category: 'Databases & Storage',
    question: 'Which database engines are supported and how are they managed?',
    answer:
      'Maxmark includes dedicated, managed MySQL 8.0 and PostgreSQL 16 database clusters. When creating a site, you choose your preferred database engine. WordPress sites use optimized MySQL 8.0 with InnoDB, while Node.js and Next.js apps can choose between PostgreSQL or MySQL with built-in connection pooling and SSL encryption.',
  },
  {
    category: 'Infrastructure & Edge',
    question: 'Where are your physical servers and edge points of presence located?',
    answer:
      'Our primary bare-metal compute nodes and database clusters are hosted in tier-3 datacenters in Lagos, London, and Frankfurt. Our Anycast DNS network and CDN edge proxies span globally across Africa, Europe, and North America, ensuring sub-100ms Time-To-First-Byte (TTFB) for users worldwide.',
  },
  {
    category: 'Backups & Recovery',
    question: 'How do automated daily backups and snapshot restores work?',
    answer:
      'Every night between 02:00 and 04:00 UTC, our automated snapshot engine captures full incremental backups of your filesystem and database dumps, which are encrypted and stored in geographically isolated object vaults. Launch plans retain 14 days of history, while Pro and Scale plans retain 30 days with 1-click point-in-time restores.',
  },
  {
    category: 'Access & Developer Tools',
    question: 'Do I get SFTP, SSH, or WP-CLI access?',
    answer:
      'Yes. Every site is provisioned with unique SFTP/SSH credentials, secure key-based authentication, and direct terminal access. WordPress sites include pre-installed WP-CLI, Redis Object Cache management, and phpMyAdmin.',
  },
  {
    category: 'Networking & Domains',
    question: 'Can I manage DNS records and export them if needed?',
    answer:
      'Absolutely. Maxmark includes a full authoritative DNS zone editor supporting A, AAAA, CNAME, MX, TXT, and SRV records with automatic RFC compliance checks. You can also export your entire zone in standard BIND format at any time with a single click, ensuring 100% portability with zero vendor lock-in.',
  },
  {
    category: 'Billing & Scaling',
    question: 'What happens if my site experiences a sudden traffic spike?',
    answer:
      'Our edge proxies and in-memory caching absorb traffic surges by serving cached static and dynamic assets instantly. If your application requires more memory or compute, our container architecture allows on-the-fly resource scaling without requiring IP changes or server re-provisioning.',
  },
]

export function AboutPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

  const stats = [
    { label: 'Uptime SLA Guarantee', value: '99.98%', icon: Shield },
    { label: 'Average Edge TTFB', value: '< 45ms', icon: Zap },
    { label: 'Global PoP Locations', value: '5 Hubs', icon: Globe },
    { label: 'NVMe Enterprise Storage', value: '100%', icon: HardDrive },
  ]

  const comparisons = [
    {
      feature: 'Deployment Flow',
      legacy: 'Manual SFTP drag-and-drop or fragile cPanel zip upload',
      maxmark: 'Automated GitHub CI/CD on git push with atomic zero-downtime swap',
    },
    {
      feature: 'Application Runtimes',
      legacy: 'PHP only (shared Apache / cPanel)',
      maxmark: 'WordPress, Node.js, Next.js (SSR/Standalone), and Static JAMstack',
    },
    {
      feature: 'Database Engines',
      legacy: 'Shared MySQL with shared connection pool limits',
      maxmark: 'Isolated MySQL 8.0 or PostgreSQL 16 with SSL and dedicated pools',
    },
    {
      feature: 'Performance & Caching',
      legacy: 'Basic file-based disk caching',
      maxmark: 'In-memory Redis Object Cache + Nginx edge acceleration',
    },
    {
      feature: 'DNS & Portability',
      legacy: 'Clunky cPanel zone editor with proprietary exports',
      maxmark: 'Live RFC-validated DNS zones + 1-click standard BIND format export',
    },
    {
      feature: 'Security & Certificates',
      legacy: 'Manual SSL cert generation and frequent expiry issues',
      maxmark: 'Automated Let’s Encrypt TLS 1.3 renewal, HSTS, and container isolation',
    },
  ]

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-12 space-y-20 text-white">
      {/* ─── HERO / MISSION ─── */}
      <div className="max-w-3xl space-y-5">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#a89cf7] px-2.5 py-1 rounded bg-[#5c4df0]/10 border border-[#5c4df0]/20">
          <Sparkles className="h-3.5 w-3.5" />
          Who We Are & What We Build
        </div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight">
          Cloud hosting engineered for speed, developer autonomy, and zero complexity.
        </h1>
        <p className="text-sm md:text-base text-white/60 leading-relaxed">
          Maxmark Host was created to solve a problem every agency, software engineer, and business owner faces:
          traditional web hosting has been trapped in the era of 2005 cPanel interfaces, while hyper-scalers (AWS/GCP)
          demand dedicated DevOps teams just to keep a web app live. We built Maxmark to deliver enterprise cloud
          power with the elegance and simplicity of push-to-deploy.
        </p>
      </div>

      {/* ─── KEY METRICS ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon
          return (
            <div
              className="p-5 rounded-xl border border-white/10 bg-[#0c0c0e] flex flex-col justify-between space-y-3"
              key={idx}
            >
              <div className="p-2 rounded-lg bg-[#5c4df0]/15 text-[#a89cf7] w-fit">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-mono font-bold text-white">{stat.value}</div>
                <div className="text-[11px] text-white/50 uppercase tracking-wider font-mono mt-1">
                  {stat.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── ARCHITECTURAL PILLARS ─── */}
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Engineered From the Hardware Up
          </h2>
          <p className="text-sm text-white/60 max-w-2xl leading-relaxed">
            Every layer of our infrastructure is tailored for modern web applications, high concurrency, and rapid
            deployment cycles.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-3">
            <div className="p-2.5 rounded-lg bg-[#5c4df0]/20 text-[#a89cf7] w-fit">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Sub-100ms TTFB</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Equipped with Nginx edge reverse proxies, Redis in-memory object caching, OPcache, and Anycast DNS
              routing, delivering blistering fast response times across Africa, Europe, and globally.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-3">
            <div className="p-2.5 rounded-lg bg-[#5c4df0]/20 text-[#a89cf7] w-fit">
              <Terminal className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Git-Native Workflow</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Say goodbye to manual file uploads and broken zip extracts. Connect your GitHub repository and watch your
              production and staging environments compile and deploy with zero downtime on push.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-3">
            <div className="p-2.5 rounded-lg bg-[#5c4df0]/20 text-[#a89cf7] w-fit">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Isolated Container Jails</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Every site runs in an isolated container sandbox with strict CPU, RAM, and disk quotas. No noisy
              neighbors, automated Let’s Encrypt TLS 1.3 certificates, and nightly encrypted backup snapshots.
            </p>
          </div>
        </div>
      </div>

      {/* ─── THE MAXMARK STORY ─── */}
      <div className="p-8 md:p-10 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-5">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#a89cf7]">
          <Server className="h-3.5 w-3.5" />
          Our Mission & Philosophy
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">
          Bridging the Infrastructure Gap for Emerging Markets
        </h2>
        <div className="space-y-4 text-xs md:text-sm text-white/70 leading-relaxed">
          <p>
            For decades, developers in emerging tech hubs throughout West Africa and beyond had two flawed choices:
            overpay for latency-heavy overseas cloud instances that require deep DevOps expertise to configure, or settle
            for outdated shared hosting providers plagued by frequent downtime and security vulnerabilities.
          </p>
          <p>
            Maxmark Host was built to deliver the best of both worlds: local low-latency presence (12ms in Lagos, 28ms in
            London, 34ms in Frankfurt), modern multi-runtime deployment tools (WordPress, Next.js, Node.js, static sites),
            and transparent pricing in local currency with zero surprise billing.
          </p>
          <p>
            We believe in complete developer freedom. That means zero proprietary lock-in. You own your code, your
            databases (standard MySQL 8.0 and PostgreSQL 16), and your DNS records (with standard RFC BIND exports).
          </p>
        </div>
      </div>

      {/* ─── COMPARISON TABLE ─── */}
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Traditional Hosting vs. Maxmark Host
          </h2>
          <p className="text-sm text-white/60 max-w-2xl leading-relaxed">
            See how Maxmark re-imagines every element of the web hosting stack for modern engineering teams.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0c0c0e]">
          <table className="w-full text-left text-xs text-white/70">
            <thead className="border-b border-white/10 bg-white/5 text-[11px] font-mono uppercase text-white/60">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Capability</th>
                <th className="px-5 py-3.5 font-semibold text-white/40">Legacy Shared / cPanel</th>
                <th className="px-5 py-3.5 font-semibold text-[#a89cf7]">Maxmark Host</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {comparisons.map((row, idx) => (
                <tr className="hover:bg-white/[0.02] transition" key={idx}>
                  <td className="px-5 py-4 font-mono font-medium text-white">{row.feature}</td>
                  <td className="px-5 py-4 text-white/50">{row.legacy}</td>
                  <td className="px-5 py-4 text-white font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>{row.maxmark}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── COMPREHENSIVE FAQ SECTION ─── */}
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#a89cf7]">
            <HelpCircle className="h-3.5 w-3.5" />
            Frequently Asked Questions
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Everything You Need to Know
          </h2>
          <p className="text-sm text-white/60 max-w-2xl leading-relaxed">
            Clear answers regarding our infrastructure, runtimes, database architecture, migration, and security.
          </p>
        </div>

        <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c0c0e] overflow-hidden">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx
            return (
              <div className="transition-colors hover:bg-white/[0.01]" key={idx}>
                <button
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between p-5 text-left text-sm font-semibold text-white transition hover:text-[#a89cf7]"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-white/40 uppercase px-2 py-0.5 rounded bg-white/5 border border-white/5">
                      {faq.category}
                    </span>
                    <span>{faq.question}</span>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-[#a89cf7] shrink-0 ml-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-white/40 shrink-0 ml-4" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs md:text-sm text-white/65 leading-relaxed border-t border-white/5 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── BOTTOM CTA ─── */}
      <div className="p-8 md:p-10 rounded-2xl border border-[#5c4df0]/30 bg-gradient-to-r from-[#5c4df0]/20 via-[#5c4df0]/10 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <h3 className="text-xl md:text-2xl font-bold text-white">Ready to experience modern hosting?</h3>
          <p className="text-xs md:text-sm text-white/60">
            Launch your first website or modern web application in under 60 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className="text-xs md:text-sm font-semibold bg-[#5c4df0] hover:bg-[#7c6ef4] text-white px-5 py-2.5 rounded-lg transition shadow-md flex items-center gap-1.5 shrink-0"
            to="/login"
          >
            Get Started <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            className="text-xs md:text-sm font-medium text-white/70 hover:text-white px-4 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 transition shrink-0"
            to="/docs"
          >
            Read Docs
          </Link>
        </div>
      </div>
    </main>
  )
}
export default AboutPage
