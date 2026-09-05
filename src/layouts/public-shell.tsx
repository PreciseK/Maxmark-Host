import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

export function PublicShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  const navLinks = [
    { label: 'About', href: '/about' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'Docs', href: '/docs' },
    { label: 'Contact', href: '/contact' },
  ]

  return (
    <div className="min-h-screen bg-[#060606] text-white flex flex-col font-sans selection:bg-[#5c4df0]/30 selection:text-white">
      {/* ─── NAV ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 h-[62px] px-6 sm:px-8 bg-[#060606]/80 backdrop-blur-md border-b border-white/[0.06] flex items-center">
        <div className="max-w-[1180px] w-full mx-auto flex items-center justify-between">
          <Link aria-label="Maxmark Host" className="flex items-center gap-2" to="/">
            <img alt="Maxmark Host" className="h-7 w-auto block" src="/logo-white.png" />
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.href
              return (
                <Link
                  className={`text-[13px] font-normal transition-colors duration-150 ${
                    isActive ? 'text-white font-medium' : 'text-white/45 hover:text-white'
                  }`}
                  key={link.href}
                  to={link.href}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <Link
              className="inline-flex items-center justify-center font-mono text-[12.5px] font-bold text-[#5c4df0] hover:text-[#7c6ef4] px-4 py-2 transition-colors"
              to="/login"
            >
              Get Started
            </Link>

            {/* Mobile Menu Button */}
            <button
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="p-1.5 text-white/60 hover:text-white md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="absolute top-[62px] left-0 right-0 bg-[#0c0c0e] border-b border-white/10 p-5 space-y-4 md:hidden shadow-2xl">
            <div className="flex flex-col space-y-3">
              {navLinks.map((link) => (
                <Link
                  className="text-sm text-white/70 hover:text-white transition py-1"
                  key={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  to={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="pt-3 border-t border-white/10">
              <Link
                className="block text-center font-mono text-xs font-bold bg-[#5c4df0] hover:bg-[#7c6ef4] text-white py-2.5 rounded transition"
                onClick={() => setMobileMenuOpen(false)}
                to="/login"
              >
                Sign In to Console
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex-1 pt-[62px] flex flex-col">
        <Outlet />
      </div>

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#080808] border-t border-white/[0.06] px-6 sm:px-8 pt-12 pb-8">
        <div className="max-w-[1180px] w-full mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-12 flex-wrap">
            <div className="footer-brand max-w-[280px]">
              <Link aria-label="Maxmark Host" className="inline-block mb-3" to="/">
                <img alt="Maxmark Host" className="h-7 w-auto block" src="/logo-white.png" />
              </Link>
              <p className="text-[13px] text-white/30 leading-relaxed">
                Modern web and managed cloud hosting built for agencies, developers, and growing businesses. WordPress,
                Node.js, Next.js, and static sites with Git CI/CD.
              </p>
            </div>

            <div className="flex gap-12 sm:gap-16 flex-wrap">
              <div className="space-y-3">
                <h4 className="font-mono text-[12px] font-bold text-white/50 tracking-wider">PRODUCT</h4>
                <ul className="space-y-2.5 text-[13px] text-white/35">
                  <li>
                    <Link className="hover:text-white transition-colors" to="/#pricing">
                      Pricing
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/docs">
                      Documentation
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/changelog">
                      Changelog
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/login">
                      Marketplace
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-mono text-[12px] font-bold text-white/50 tracking-wider">HOSTING</h4>
                <ul className="space-y-2.5 text-[13px] text-white/35">
                  <li>
                    <Link className="hover:text-white transition-colors" to="/docs">
                      Managed WordPress
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/docs">
                      Node.js & Next.js Hosting
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/docs">
                      Git CI/CD Deploy
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/docs">
                      Live DNS & Free SSL
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/docs">
                      Daily Backups & Redis
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-mono text-[12px] font-bold text-white/50 tracking-wider">COMPANY</h4>
                <ul className="space-y-2.5 text-[13px] text-white/35">
                  <li>
                    <Link className="hover:text-white transition-colors" to="/about">
                      About
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/changelog">
                      Changelog
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/contact">
                      Contact & Sales
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-white transition-colors" to="/login">
                      Support Console
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/20">
            <span>© 2026 Maxmark Host. All rights reserved.</span>
            <div className="flex items-center gap-6 text-white/25">
              <Link className="hover:text-white/50 transition-colors" to="/legal/privacy">
                Privacy
              </Link>
              <Link className="hover:text-white/50 transition-colors" to="/legal/terms">
                Terms
              </Link>
              <Link className="hover:text-white/50 transition-colors" to="/legal/cookies">
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
export default PublicShell
