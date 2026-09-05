import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Shield,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'

export function AboutPage() {
  return (
    <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-12 space-y-16">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#a89cf7] px-2.5 py-1 rounded bg-[#5c4df0]/10 border border-[#5c4df0]/20">
            <Sparkles className="h-3.5 w-3.5" />
            Built for Modern Developers & Agencies
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            Cloud hosting engineered for speed, simplicity, and complete freedom.
          </h1>
          <p className="text-sm md:text-base text-white/60 leading-relaxed">
            Maxmark Host was born from a frustration with decades-old legacy hosting panels, bloated software suites,
            and fragmented cloud providers. We unified managed WordPress, Node.js, Next.js, and static site hosting
            into one high-performance platform with automated Git CI/CD and live DNS management.
          </p>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-3">
            <div className="p-2.5 rounded-lg bg-[#5c4df0]/20 text-[#a89cf7] w-fit">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Sub-100ms TTFB</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Equipped with Nginx edge caching, Redis object memory caching, OPcache, and Anycast DNS routing,
              delivering blistering fast page loads across Africa, Europe, and globally.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-3">
            <div className="p-2.5 rounded-lg bg-[#5c4df0]/20 text-[#a89cf7] w-fit">
              <Terminal className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Git-Native Workflow</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              No manual SFTP drag-and-drop or fragile zip uploads. Push to your GitHub repository and watch your
              production or staging environments compile and swap with zero downtime.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-3">
            <div className="p-2.5 rounded-lg bg-[#5c4df0]/20 text-[#a89cf7] w-fit">
              <Shield className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">Security by Default</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Every deployment is isolated in its own execution container. Free Let’s Encrypt TLS certificates,
              automatic HSTS, and nightly encrypted backup snapshots protect your business data.
            </p>
          </div>
        </div>

        {/* Why Maxmark Section */}
        <div className="p-8 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-6">
          <h2 className="text-xl md:text-2xl font-bold text-white">Why Developers Choose Maxmark</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-white/70">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Multi-runtime freedom: run WordPress and modern Node.js/Next.js side by side.</span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Dedicated database engines: choose between MySQL 8.0 or PostgreSQL 16 on demand.</span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Live DNS Editor with standard BIND export — zero vendor lock-in on your DNS zones.</span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Transparent pricing in local & international currency with no surprise overage fees.</span>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="p-8 rounded-2xl border border-[#5c4df0]/30 bg-gradient-to-r from-[#5c4df0]/20 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white">Ready to experience modern hosting?</h3>
            <p className="text-xs text-white/60">Launch your first site in under 60 seconds.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="text-xs font-semibold bg-[#5c4df0] hover:bg-[#7c6ef4] text-white px-5 py-2.5 rounded-lg transition shadow-md flex items-center gap-1.5"
              to="/login"
            >
              Get Started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              className="text-xs font-medium text-white/70 hover:text-white px-4 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 transition"
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
