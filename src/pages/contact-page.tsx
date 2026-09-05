import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Clock,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    inquiryType: 'sales',
    message: '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formState.email || !formState.message) return
    setSubmitted(true)
  }

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-12 space-y-12">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#a89cf7] px-2.5 py-1 rounded bg-[#5c4df0]/10 border border-[#5c4df0]/20">
            <Sparkles className="h-3.5 w-3.5" />
            Direct Support & Enterprise Sales
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Let’s talk about your cloud infrastructure.
          </h1>
          <p className="text-sm md:text-base text-white/60 leading-relaxed">
            Have a question about dedicated node allocation, multi-site agency migrations, or custom SLA packages?
            Our engineering team is ready to assist.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left: Contact Form */}
          <div className="lg:col-span-7">
            <div className="p-6 md:p-8 rounded-2xl border border-white/10 bg-[#0c0c0e] shadow-xl relative overflow-hidden">
              {submitted ? (
                <div className="py-12 text-center space-y-4">
                  <div className="inline-flex p-3 rounded-full bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Message Received</h3>
                  <p className="text-xs text-white/60 max-w-md mx-auto leading-relaxed">
                    Thank you for reaching out, {formState.name || 'there'}. An infrastructure specialist will review
                    your inquiry and respond to <span className="text-white font-mono">{formState.email}</span> within 2
                    hours.
                  </p>
                  <button
                    className="mt-4 px-4 py-2 text-xs font-semibold rounded bg-white/10 hover:bg-white/15 text-white transition"
                    onClick={() => {
                      setSubmitted(false)
                      setFormState({ name: '', email: '', inquiryType: 'sales', message: '' })
                    }}
                    type="button"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-white/70">Your Name</label>
                      <input
                        className="w-full bg-[#161619] border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#5c4df0] transition"
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        placeholder="Alex Morgan"
                        required
                        type="text"
                        value={formState.name}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-white/70">Work Email</label>
                      <input
                        className="w-full bg-[#161619] border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#5c4df0] transition"
                        onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                        placeholder="alex@company.com"
                        required
                        type="email"
                        value={formState.email}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/70">Inquiry Purpose</label>
                    <select
                      className="w-full bg-[#161619] border border-white/10 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#5c4df0] transition"
                      onChange={(e) => setFormState({ ...formState, inquiryType: e.target.value })}
                      value={formState.inquiryType}
                    >
                      <option value="sales">Enterprise Plan & Custom Quotes</option>
                      <option value="migration">Assisted Website & Database Migration</option>
                      <option value="agency">Agency Volume Discount & Reseller</option>
                      <option value="technical">Technical Architecture & Stack Question</option>
                      <option value="billing">Billing & Commercial Settlement</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/70">Project Details or Requirements</label>
                    <textarea
                      className="w-full bg-[#161619] border border-white/10 rounded-lg p-3.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#5c4df0] transition min-h-[120px]"
                      onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                      placeholder="Tell us about your traffic requirements, stack (WordPress, Next.js, Node.js, databases), or migration timeline..."
                      required
                      value={formState.message}
                    />
                  </div>

                  <button
                    className="w-full flex items-center justify-center gap-2 bg-[#5c4df0] hover:bg-[#7c6ef4] text-white py-3 rounded-lg text-xs font-semibold transition shadow-md"
                    type="submit"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Message to Infrastructure Team</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Right: Direct Channels & SLA Info */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Direct Channels
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <Mail className="h-4 w-4 text-[#a89cf7] mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">General & Sales Inquiries</div>
                    <a className="text-xs text-white/60 hover:text-white font-mono transition" href="mailto:support@maxmark.host">
                      support@maxmark.host
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Security & Vulnerability Reports</div>
                    <a className="text-xs text-white/60 hover:text-white font-mono transition" href="mailto:security@maxmark.host">
                      security@maxmark.host
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <Clock className="h-4 w-4 text-amber-400 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Enterprise SLA Response</div>
                    <p className="text-xs text-white/60">Under 15 minutes for critical incidents</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-[#0c0c0e] space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Global Infrastructure
              </h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Hosting nodes distributed across low-latency edge datacenters in Lagos, London, and Frankfurt with
                automated DDoS scrubbing and redundant fiber transit.
              </p>
              <div className="pt-2">
                <Link className="text-xs text-[#a89cf7] hover:underline" to="/docs">
                  Explore Network Architecture in Docs →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
  )
}
export default ContactPage
