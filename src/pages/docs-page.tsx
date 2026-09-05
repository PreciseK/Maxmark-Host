import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Database,
  ExternalLink,
  GitBranch,
  Globe,
  HelpCircle,
  Layers,
  Lock,
  Rocket,
  Search,
  Server,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react'

interface DocSection {
  id: string
  title: string
  category: string
  icon: React.ComponentType<{ className?: string }>
  summary: string
  content: {
    description: string
    alert?: { type: 'tip' | 'note' | 'warning'; text: string }
    codeBlocks?: { title: string; language: string; code: string }[]
    steps?: { step: string; detail: string }[]
    table?: { headers: string[]; rows: string[][] }
  }
}

const DOC_SECTIONS: DocSection[] = [
  {
    id: 'quickstart',
    title: 'Platform Quickstart',
    category: 'Getting Started',
    icon: Rocket,
    summary: 'Deploy your first website or modern web application on Maxmark Host in under 3 minutes.',
    content: {
      description:
        'Maxmark Host provides containerized, high-speed managed hosting for WordPress, Node.js, Next.js, and static sites. Every provisioned site includes an isolated execution jail, automated Let’s Encrypt SSL, daily snapshot backups, and optional live DNS zone management.',
      alert: {
        type: 'tip',
        text: 'New accounts include automated GitHub repository binding and instant deployment preview URLs (*.maxmarkhost.com).',
      },
      steps: [
        {
          step: '1. Create an account or sign in',
          detail: 'Navigate to the Maxmark console, authenticate, and select your target plan (Launch, Pro, or Scale).',
        },
        {
          step: '2. Choose your deployment type',
          detail: 'Select between Managed WordPress, Node.js / Next.js application, or static HTML / Vite bundle.',
        },
        {
          step: '3. Select database engine',
          detail: 'Pick between MySQL 8.0 (standard for WordPress and classic stacks) or PostgreSQL 16 (ideal for modern Node/Next.js services).',
        },
        {
          step: '4. Bind your repository or domain',
          detail: 'Connect your GitHub repository for continuous push-to-deploy, or map a custom apex / subdomain with live DNS records.',
        },
      ],
      codeBlocks: [
        {
          title: 'Direct Deployment via Git',
          language: 'bash',
          code: `# Clone your repository locally
git clone https://github.com/your-org/my-app.git
cd my-app

# Maxmark automatically detects your package.json / Dockerfile
# Push to main to trigger the cloud builder pipeline
git push origin main`,
        },
      ],
    },
  },
  {
    id: 'wordpress-hosting',
    title: 'Managed WordPress',
    category: 'Runtimes',
    icon: Server,
    summary: 'High-performance WordPress hosting with PHP 8.2/8.3, OPcache, and Redis Object Cache.',
    content: {
      description:
        'Maxmark Managed WordPress includes automated database creation, SFTP/SSH access keys, automatic core/plugin updates, and preconfigured Redis Object Cache for sub-100ms response times.',
      alert: {
        type: 'note',
        text: 'Redis Object Cache is enabled by default on Pro and Scale tiers, cutting database queries per pageview by up to 85%.',
      },
      table: {
        headers: ['Component', 'Specification', 'Management'],
        rows: [
          ['PHP Engine', 'PHP 8.2 & 8.3 with JIT & OPcache', 'Switchable via Dashboard'],
          ['Web Server', 'Nginx reverse proxy + isolated PHP-FPM', 'Auto-tuned per plan'],
          ['Database', 'Dedicated MySQL 8.0 database & user', 'phpMyAdmin / CLI'],
          ['Caching', 'In-memory Redis object cache', '1-click purge via panel'],
          ['Backups', 'Daily automated snapshots (14 to 30 days)', '1-click point-in-time restore'],
        ],
      },
      codeBlocks: [
        {
          title: 'Redis Object Cache (wp-config.php snippet)',
          language: 'php',
          code: `/** Maxmark Managed Redis Configuration **/
define('WP_REDIS_HOST', '127.0.0.1');
define('WP_REDIS_PORT', 6379);
define('WP_REDIS_TIMEOUT', 1);
define('WP_REDIS_READ_TIMEOUT', 1);
define('WP_CACHE', true);`,
        },
      ],
    },
  },
  {
    id: 'nodejs-nextjs',
    title: 'Node.js & Next.js Hosting',
    category: 'Runtimes',
    icon: Code2,
    summary: 'Deploy full-stack SSR, API routes, and background workers with zero server configuration.',
    content: {
      description:
        'Maxmark runs Node.js and Next.js applications in isolated container runtimes with automatic process supervision (PM2 / systemd), automatic SSL termination, zero-downtime rolling reloads, and WebSocket support.',
      alert: {
        type: 'tip',
        text: 'For Next.js standalone output, set output: "standalone" in your next.config.js to produce an optimized minimal container image.',
      },
      steps: [
        {
          step: '1. Prepare your package.json',
          detail: 'Ensure you specify a build script ("build": "next build") and a start script ("start": "next start -p $PORT").',
        },
        {
          step: '2. Configure Environment Variables',
          detail: 'Add your database connection URLs, JWT secrets, and API keys under the Site Dashboard -> Environment tab.',
        },
        {
          step: '3. Enable GitHub Webhook Auto-Deploy',
          detail: 'Every commit pushed to your production branch is compiled, tested, and rolled out seamlessly.',
        },
      ],
      codeBlocks: [
        {
          title: 'next.config.js (Recommended standalone mode)',
          language: 'javascript',
          code: `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
};

module.exports = nextConfig;`,
        },
        {
          title: 'package.json Scripts Sample',
          language: 'json',
          code: `{
  "name": "enterprise-portal",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start -p $PORT"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "pg": "^8.12.0"
  }
}`,
        },
      ],
    },
  },
  {
    id: 'static-sites',
    title: 'Static & JAMstack Hosting',
    category: 'Runtimes',
    icon: Layers,
    summary: 'Blazing fast edge hosting for Vite, Astro, Nuxt, and pure HTML/CSS/JS websites.',
    content: {
      description:
        'Static applications deployed on Maxmark are cached across our multi-region CDN edge network. Requests are served with Brotli and Gzip compression, HTTP/2 multiplexing, and configurable Single Page Application (SPA) client-side routing fallbacks.',
      alert: {
        type: 'note',
        text: 'Static sites do not require a database and benefit from unlimited instant deployment previews.',
      },
      codeBlocks: [
        {
          title: 'Vite Build & Deploy Workflow',
          language: 'bash',
          code: `# Build your production static assets
npm run build

# Output directory is typically ./dist or ./build
# Maxmark automatically detects the build output and syncs to edge storage`,
        },
      ],
    },
  },
  {
    id: 'databases',
    title: 'Managed MySQL & PostgreSQL',
    category: 'Databases',
    icon: Database,
    summary: 'Dedicated relational database engines with connection pooling, automated backups, and SSL encryption.',
    content: {
      description:
        'Maxmark allows you to select between MySQL 8.0 and PostgreSQL 16 on a per-site basis. Databases are pre-configured with UTF-8 character sets, secure credentials, internal fast-path routing (127.0.0.1 / localhost), and optional external SSL access.',
      alert: {
        type: 'warning',
        text: 'Never expose raw database credentials in client-side code. Always inject credentials through server-side environment variables.',
      },
      codeBlocks: [
        {
          title: 'PostgreSQL Connection (Node.js pg)',
          language: 'javascript',
          code: `import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

export default pool;`,
        },
        {
          title: 'MySQL Connection (Node.js mysql2/promise)',
          language: 'javascript',
          code: `import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;`,
        },
      ],
    },
  },
  {
    id: 'git-cicd',
    title: 'GitHub CI/CD & Auto-Deploy',
    category: 'Deployment',
    icon: GitBranch,
    summary: 'Connect your GitHub repository to trigger automated builds and zero-downtime updates on push.',
    content: {
      description:
        'The Maxmark Git integration creates a cryptographically signed HMAC SHA-256 webhook on your GitHub repository. When you push to your selected branch (e.g. `main`), Maxmark pulls the delta, compiles dependencies in an ephemeral builder sandbox, and performs an atomic directory swap.',
      alert: {
        type: 'tip',
        text: 'If a build fails (e.g. TypeScript or test error), the deployment safely aborts, keeping your live site running without interruption.',
      },
      steps: [
        {
          step: '1. Connect GitHub Account',
          detail: 'Open your Site Details -> Git & CI/CD tab and authenticate your GitHub account or paste a repository URL.',
        },
        {
          step: '2. Configure Target Branch',
          detail: 'Specify the production branch to track (default: main).',
        },
        {
          step: '3. Copy Webhook Secret',
          detail: 'Maxmark generates a unique webhook endpoint and secret for automatic synchronization.',
        },
        {
          step: '4. Push & Monitor Logs',
          detail: 'View real-time streaming build logs and deployment status directly in your dashboard.',
        },
      ],
      codeBlocks: [
        {
          title: 'Deployment Notification Payload (Sample)',
          language: 'json',
          code: `{
  "event": "push",
  "ref": "refs/heads/main",
  "repository": "company/ecommerce-app",
  "head_commit": {
    "id": "7f8b91c",
    "message": "feat: optimize checkout page queries",
    "author": { "name": "Lead Engineer" }
  },
  "status": "deployed",
  "duration_ms": 1420
}`,
        },
      ],
    },
  },
  {
    id: 'dns-management',
    title: 'Live DNS & BIND Export',
    category: 'Networking',
    icon: Globe,
    summary: 'Manage DNS zones with RFC-compliant validation, live propagation, and standard BIND exports.',
    content: {
      description:
        'Maxmark includes a built-in authoritative DNS management system. Point your domain nameservers to `ns1.maxmarkhost.com` and `ns2.maxmarkhost.com` to manage records directly from your dashboard.',
      alert: {
        type: 'note',
        text: 'The DNS engine prevents apex CNAME misconfigurations and ensures at least one NS record is always maintained to prevent zone breakage.',
      },
      table: {
        headers: ['Record Type', 'Use Case', 'Validation Rule'],
        rows: [
          ['A', 'Point hostname to IPv4 address', 'Valid IPv4 (e.g. 185.199.108.153)'],
          ['AAAA', 'Point hostname to IPv6 address', 'Valid IPv6 (e.g. 2606:4700:4700::1111)'],
          ['CNAME', 'Canonical alias to another domain', 'Subdomains only; cannot coexist with other records'],
          ['MX', 'Mail exchanger routing', 'Priority integer (0-65535) followed by mail host'],
          ['TXT', 'SPF, DKIM, site verification', 'String literals; automatic quotes provided'],
          ['SRV', 'Service location discovery', 'Priority, Weight, Port, and Target'],
        ],
      },
      codeBlocks: [
        {
          title: 'Sample BIND Zone File Output',
          language: 'text',
          code: `; Zone file for example.com generated by Maxmark Host
$TTL 3600
@   IN  SOA ns1.maxmarkhost.com. hostmaster.example.com. (
            2026090501 ; Serial
            7200       ; Refresh
            3600       ; Retry
            1209600    ; Expire
            3600 )     ; Minimum

@       IN  NS      ns1.maxmarkhost.com.
@       IN  NS      ns2.maxmarkhost.com.
@       IN  A       162.243.18.42
www     IN  CNAME   example.com.
@       IN  MX  10  mail.example.com.
@       IN  TXT     "v=spf1 include:_spf.maxmarkhost.com ~all"`,
        },
      ],
    },
  },
  {
    id: 'security-ssl',
    title: 'Free SSL & Security Architecture',
    category: 'Security',
    icon: Lock,
    summary: 'Automated Let’s Encrypt TLS 1.3 certificates, HTTP/2, DDoS defense, and container isolation.',
    content: {
      description:
        'Every site provisioned on Maxmark is automatically issued a valid TLS/SSL certificate with automatic 90-day renewal. All unencrypted HTTP traffic is seamlessly upgraded to HTTPS using 301 permanent redirects.',
      alert: {
        type: 'note',
        text: 'Security headers including HSTS, X-Content-Type-Options: nosniff, and X-Frame-Options are applied at the edge proxy layer.',
      },
      steps: [
        {
          step: '1. Point DNS A Record',
          detail: 'Point your domain to your site’s assigned Maxmark IP address.',
        },
        {
          step: '2. ACME Challenge Verification',
          detail: 'Our automated Let’s Encrypt worker verifies domain ownership via HTTP-01 challenge.',
        },
        {
          step: '3. Instant TLS Activation',
          detail: 'The SSL certificate is installed and active globally within 30 seconds of DNS resolution.',
        },
      ],
      codeBlocks: [
        {
          title: 'Automated Security Headers at Edge',
          language: 'http',
          code: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()`,
        },
      ],
    },
  },
  {
    id: 'backups-disaster-recovery',
    title: 'Automated Backups & Snapshots',
    category: 'Operations',
    icon: Shield,
    summary: 'Nightly incremental backups and on-demand snapshots with one-click restore.',
    content: {
      description:
        'Never worry about data loss. Maxmark captures full database dumps and filesystem snapshots every night, stored redundantly across geographically separated object storage vaults.',
      alert: {
        type: 'tip',
        text: 'Launch tier includes 14-day backup history. Pro and Scale tiers include 30-day history plus unlimited manual pre-update snapshots.',
      },
      steps: [
        {
          step: '1. Automatic Nightly Execution',
          detail: 'Backups run between 02:00 and 04:00 UTC with zero downtime or database locks.',
        },
        {
          step: '2. Pre-Deployment Snapshots',
          detail: 'Create an immediate snapshot before running major plugin updates or code deployments.',
        },
        {
          step: '3. One-Click Point-in-Time Restore',
          detail: 'Roll back your site files, database, or both to any date in your retention window.',
        },
      ],
    },
  },
  {
    id: 'cli-env',
    title: 'Environment Variables & CLI',
    category: 'Developer Tools',
    icon: Terminal,
    summary: 'Manage environment variables, secrets, and deployment flags safely.',
    content: {
      description:
        'Variables configured in your Maxmark dashboard are securely encrypted at rest using AES-256 and injected into your container runtime at startup without being checked into source control.',
      codeBlocks: [
        {
          title: 'Standard Environment Variables Provided by Maxmark',
          language: 'bash',
          code: `# System provided runtime environment
NODE_ENV=production
PORT=3000
MAXMARK_SITE_ID=site_84920482
MAXMARK_SITE_DOMAIN=mybrand.com
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/app_db
REDIS_URL=redis://127.0.0.1:6379`,
        },
      ],
    },
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting & FAQ',
    category: 'Support',
    icon: HelpCircle,
    summary: 'Solutions to common deployment, port binding, and domain verification questions.',
    content: {
      description:
        'Find rapid answers to the most frequent developer issues encountered when building or migrating projects to Maxmark Host.',
      table: {
        headers: ['Issue', 'Root Cause', 'Recommended Resolution'],
        rows: [
          [
            'Port Error / EADDRINUSE',
            'Hardcoded port in start script',
            'Always bind to process.env.PORT or pass -p $PORT in start script.',
          ],
          [
            'SSL Certificate Pending',
            'DNS has not propagated yet',
            'Ensure nameservers or A record point to the Maxmark IP. Propagation takes 5-30 minutes.',
          ],
          [
            'Database Connection Refused',
            'Incorrect host or password',
            'Use 127.0.0.1 for local database instances or copy the exact connection string from the Credentials tab.',
          ],
          [
            'Git Webhook 401 Unauthorized',
            'Mismatching secret token',
            'Regenerate your webhook secret in the Git & CI/CD tab and update the GitHub webhook settings.',
          ],
          [
            'WordPress Memory Limit Exhausted',
            'Complex plugins demanding RAM',
            'Increase WP_MEMORY_LIMIT to 256M or upgrade to the Pro plan for dedicated allocations.',
          ],
        ],
      },
    },
  },
]

export function DocsPage() {
  const [activeId, setActiveId] = useState<string>('quickstart')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)

  const activeDoc = DOC_SECTIONS.find((s) => s.id === activeId) || DOC_SECTIONS[0]

  const filteredSections = DOC_SECTIONS.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const categories = Array.from(new Set(DOC_SECTIONS.map((s) => s.category)))

  function copyCode(code: string, blockKey: string) {
    void navigator.clipboard.writeText(code)
    setCopiedIndex(blockKey)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="min-h-screen bg-[#060606] text-white flex flex-col selection:bg-[#5c4df0]/30 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060606]/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link className="flex items-center gap-2" to="/">
            <img src="/logo-white.png" alt="Maxmark Host" className="h-6 w-auto" />
            <span className="text-white/20 font-mono text-xs">/</span>
            <span className="text-[#a89cf7] font-mono text-xs font-semibold">docs</span>
          </Link>
          <span className="hidden sm:inline-block text-xs font-mono text-white/30 px-2 py-0.5 rounded border border-white/10">
            v2.4
          </span>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-4 flex-1 max-w-md mx-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
            <input
              className="w-full bg-[#121214] border border-white/10 rounded-md pl-9 pr-4 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#5c4df0] transition"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides, runtimes, commands..."
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            className="text-xs font-medium text-white/70 hover:text-white transition px-3 py-1.5 rounded hover:bg-white/5"
            to="/status"
          >
            System Status
          </Link>
          <Link
            className="text-xs font-semibold bg-[#5c4df0] hover:bg-[#7c6ef4] text-white px-3.5 py-1.5 rounded transition shadow-sm"
            to="/login"
          >
            Console
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Left Sidebar */}
        <aside className="w-full md:w-64 shrink-0 border-r border-white/10 p-5 space-y-6 bg-[#08080a]">
          <div className="text-[11px] font-mono uppercase tracking-widest text-white/40">Documentation</div>

          <div className="space-y-5">
            {categories.map((category) => {
              const items = filteredSections.filter((s) => s.category === category)
              if (items.length === 0) return null

              return (
                <div key={category} className="space-y-1.5">
                  <div className="text-xs font-semibold text-white/40 px-2 uppercase tracking-wider text-[10px]">
                    {category}
                  </div>
                  {items.map((item) => {
                    const Icon = item.icon
                    const isSelected = activeId === item.id
                    return (
                      <button
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition text-left ${
                          isSelected
                            ? 'bg-[#5c4df0]/20 text-[#a89cf7] border border-[#5c4df0]/40 font-semibold'
                            : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}
                        key={item.id}
                        onClick={() => setActiveId(item.id)}
                        type="button"
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-[#a89cf7]' : 'text-white/40'}`} />
                        <span className="truncate">{item.title}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="pt-6 border-t border-white/10 space-y-2 text-xs text-white/50">
            <p className="font-semibold text-white/70">Need assistance?</p>
            <p className="text-[11px] leading-relaxed">
              Our 24/7 technical team is available to help migrate your databases and applications.
            </p>
            <Link
              className="inline-flex items-center gap-1.5 text-[#5c4df0] hover:text-[#7c6ef4] font-medium transition"
              to="/contact"
            >
              Contact Support <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-10 max-w-4xl">
          <div className="space-y-8">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs font-mono text-white/40">
              <Link className="hover:text-white transition" to="/">Maxmark</Link>
              <span>/</span>
              <span className="text-white/60">Docs</span>
              <span>/</span>
              <span className="text-[#a89cf7]">{activeDoc.category}</span>
            </div>

            {/* Header */}
            <div className="space-y-3 pb-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[#5c4df0]/20 border border-[#5c4df0]/30 text-[#a89cf7]">
                  <activeDoc.icon className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{activeDoc.title}</h1>
                  <p className="text-xs md:text-sm text-white/50 mt-1">{activeDoc.summary}</p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="text-sm md:text-base text-white/80 leading-relaxed space-y-4">
              <p>{activeDoc.content.description}</p>
            </div>

            {/* Alert / Callout */}
            {activeDoc.content.alert ? (
              <div
                className={`p-4 rounded-lg border text-xs md:text-sm leading-relaxed flex items-start gap-3 ${
                  activeDoc.content.alert.type === 'tip'
                    ? 'bg-[#5c4df0]/10 border-[#5c4df0]/30 text-white/90'
                    : activeDoc.content.alert.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-white/5 border-white/10 text-white/80'
                }`}
              >
                <div className="mt-0.5">
                  {activeDoc.content.alert.type === 'tip' && <Zap className="h-4 w-4 text-[#a89cf7]" />}
                  {activeDoc.content.alert.type === 'warning' && <Shield className="h-4 w-4 text-amber-400" />}
                  {activeDoc.content.alert.type === 'note' && <BookOpen className="h-4 w-4 text-white/50" />}
                </div>
                <div>
                  <strong className="font-semibold uppercase tracking-wider text-[11px] block mb-1">
                    {activeDoc.content.alert.type}
                  </strong>
                  {activeDoc.content.alert.text}
                </div>
              </div>
            ) : null}

            {/* Steps */}
            {activeDoc.content.steps ? (
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/60 font-mono">
                  Implementation Walkthrough
                </h3>
                <div className="space-y-3">
                  {activeDoc.content.steps.map((s, idx) => (
                    <div
                      className="p-4 rounded-lg border border-white/10 bg-[#0d0d10] flex flex-col gap-1 transition hover:border-white/20"
                      key={idx}
                    >
                      <h4 className="text-sm font-semibold text-white">{s.step}</h4>
                      <p className="text-xs text-white/60 leading-relaxed">{s.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Table */}
            {activeDoc.content.table ? (
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/60 font-mono">
                  Specifications & Rules
                </h3>
                <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0d0d10]">
                  <table className="w-full text-left text-xs text-white/70">
                    <thead className="border-b border-white/10 bg-white/5 text-[11px] font-mono uppercase text-white/60">
                      <tr>
                        {activeDoc.content.table.headers.map((h, i) => (
                          <th className="px-4 py-3 font-semibold" key={i}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {activeDoc.content.table.rows.map((row, rIdx) => (
                        <tr className="hover:bg-white/5 transition" key={rIdx}>
                          {row.map((cell, cIdx) => (
                            <td
                              className={`px-4 py-3 ${cIdx === 0 ? 'font-mono text-white font-medium' : ''}`}
                              key={cIdx}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Code Blocks */}
            {activeDoc.content.codeBlocks ? (
              <div className="space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/60 font-mono">
                  Code & Configuration Examples
                </h3>
                {activeDoc.content.codeBlocks.map((block, idx) => {
                  const blockKey = `${activeDoc.id}-${idx}`
                  const isCopied = copiedIndex === blockKey

                  return (
                    <div className="rounded-lg border border-white/10 bg-[#0d0d10] overflow-hidden" key={idx}>
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/5 text-xs font-mono">
                        <span className="text-white/60 flex items-center gap-2">
                          <Terminal className="h-3.5 w-3.5 text-[#a89cf7]" />
                          {block.title}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-white/40 uppercase">{block.language}</span>
                          <button
                            className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white transition px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                            onClick={() => copyCode(block.code, blockKey)}
                            type="button"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      <pre className="p-4 text-xs font-mono text-white/90 overflow-x-auto leading-relaxed bg-[#0a0a0c]">
                        <code>{block.code}</code>
                      </pre>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {/* Next / Previous Navigation */}
            <div className="pt-8 border-t border-white/10 flex items-center justify-between">
              <Link
                className="inline-flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white transition"
                to="/"
              >
                ← Return to Maxmark Home
              </Link>
              <Link
                className="inline-flex items-center gap-2 text-xs font-semibold text-[#a89cf7] hover:text-white transition"
                to="/login"
              >
                Open Maxmark Console <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
export default DocsPage
