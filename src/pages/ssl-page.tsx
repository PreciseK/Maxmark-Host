import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ShieldCheck } from 'lucide-react'

import { fetchSslCertificates, type SslCertificate } from '@/lib/db/ssl'
import { supabase } from '@/lib/supabase'
import { formatDateLabel } from '@/lib/utils'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/ui-states'

const statusStyles: Record<SslCertificate['status'], string> = {
  installed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  not_installed: 'border-white/20 bg-white/5 text-white/70',
}

const statusLabels: Record<SslCertificate['status'], string> = {
  installed: 'Installed',
  pending: 'Pending',
  not_installed: 'Not Installed',
}

export function SslPage() {
  const [certificates, setCertificates] = useState<SslCertificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadCertificates() {
    if (!supabase) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      setCertificates(await fetchSslCertificates(sb))
    } catch (err) {
      console.error('SSL certificate fetch failed:', err)
      setError(err instanceof Error ? err.message : 'Certificates could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCertificates()
  }, [])

  return (
    <div className="space-y-6 text-left">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">SSL Certificates</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Certificates</h1>
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white" type="button">
          Add Certificate
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {error ? (
        <ErrorState
          title="SSL Error"
          message="Could not load your SSL certificates."
          error={error}
          onRetry={() => void loadCertificates()}
        />
      ) : loading ? (
        <TableSkeleton rows={3} />
      ) : certificates.length === 0 ? (
        <div className="py-6">
          <EmptyState
            badge="Let's Encrypt AutoSSL"
            icon={<ShieldCheck className="h-7 w-7 text-violet-400" />}
            title="No Certificates Installed"
            description="AutoSSL automatically provisions and renews SSL certificates for all your active WordPress site domains."
            actionLabel="Order Certificate"
            secondaryActionLabel="Import Custom SSL"
          />
        </div>
      ) : (
        <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                  <th className="px-5 py-3 font-semibold">Domain</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Expires</th>
                  <th className="px-5 py-3 font-semibold">Key Length</th>
                  <th className="px-5 py-3 font-semibold">Auto-Renew</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328] text-xs text-white">
                {certificates.map((cert) => (
                  <tr className="hover:bg-[#1c1c20] transition" key={cert.id}>
                    <td className="px-5 py-4 space-y-1">
                      <div className="font-medium text-white">{cert.domain}</div>
                      {cert.domainsIncluded.length > 1 && (
                        <div className="text-muted-foreground text-[10px]">
                          +{cert.domainsIncluded.length - 1} additional domain
                          {cert.domainsIncluded.length > 2 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex border px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyles[cert.status]}`}
                      >
                        {statusLabels[cert.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {cert.expiresAt ? formatDateLabel(cert.expiresAt) : '—'}
                    </td>
                    <td className="px-5 py-4 font-mono">{cert.keyLength}-bit</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {cert.autoRenew ? 'Enabled' : 'Disabled'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
