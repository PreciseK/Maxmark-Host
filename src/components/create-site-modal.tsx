import { startTransition, useDeferredValue, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Globe,
  LoaderCircle,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { provisionSite } from '@/services/provisioningService'
import type { ManagedSite, ProvisioningStep } from '@/types/provisioning'

interface CreateSiteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingDomains?: string[]
  initialDomain?: string
  onSiteCreated: (site: ManagedSite) => void
}

function sanitizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')
}

function toDbPreview(value: string) {
  const safe = sanitizeDomain(value).replace(/[^a-z0-9]/g, '').slice(0, 12)
  return safe ? `maxmark_${safe}` : 'maxmark_client'
}

export function CreateSiteModal({
  open,
  onOpenChange,
  existingDomains,
  onSiteCreated,
}: CreateSiteModalProps) {
  const [domain, setDomain] = useState('')
  const [steps, setSteps] = useState<ProvisioningStep[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [phase, setPhase] = useState<'idle' | 'provisioning' | 'success'>('idle')
  const [createdSite, setCreatedSite] = useState<ManagedSite | null>(null)
  const deferredDomain = useDeferredValue(domain)
  const normalizedPreview = sanitizeDomain(deferredDomain)
  const completedSteps = steps.filter((step) => step.state === 'completed').length
  const progressValue = steps.length ? (completedSteps / steps.length) * 100 : 0

  function resetState() {
    setDomain('')
    setSteps([])
    setErrorMessage('')
    setPhase('idle')
    setCreatedSite(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (phase === 'provisioning' && !nextOpen) {
      return
    }

    if (!nextOpen) {
      resetState()
    }

    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setPhase('provisioning')
    setSteps([])

    try {
      const site = await provisionSite(domain, {
        existingDomains: existingDomains ?? [],
        onProgress: setSteps,
      })

      setCreatedSite(site)
      setPhase('success')
      startTransition(() => onSiteCreated(site))
    } catch (error) {
      setPhase('idle')
      setErrorMessage(
        error instanceof Error ? error.message : 'Provisioning did not complete.',
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#161619] border border-[#232328] text-white max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="inline-block border border-[#2d2d34] bg-[#202024] text-white px-2 py-0.5 rounded text-[10px] font-semibold uppercase">
              Premium provisioning
            </span>
          </div>
          <DialogTitle className="text-white text-lg font-bold mt-2">
            Create a new WordPress site
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
            Maxmark will place the domain on the lowest-load cPanel account, create
            a dedicated database, and unlock your dashboard as soon as provisioning
            finishes.
          </DialogDescription>
        </DialogHeader>

        {phase === 'success' && createdSite ? (
          <div className="space-y-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500 shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-white">
                  {createdSite.site_domain} is live in Maxmark
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The site inventory is provisioned with its own database and isolated
                  document root. You can jump straight into the site dashboard now.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-md border border-[#232328] bg-[#121214] p-4 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Domain
                </span>
                <p className="font-semibold text-white truncate">
                  {createdSite.site_domain}
                </p>
              </div>
              <div className="rounded-md border border-[#232328] bg-[#121214] p-4 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Database
                </span>
                <p className="font-semibold text-white font-mono truncate">
                  {createdSite.db_name}
                </p>
              </div>
              <div className="rounded-md border border-[#232328] bg-[#121214] p-4 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Root
                </span>
                <p className="font-semibold text-white font-mono truncate" title={createdSite.document_root}>
                  {createdSite.document_root}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <button
                className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </button>
              <Link
                to={`/sites/${createdSite.id}`}
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition"
              >
                Open site dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-6 text-xs" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
              <div className="space-y-3">
                <label
                  className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block"
                  htmlFor="domain"
                >
                  Primary domain
                </label>
                <Input
                  id="domain"
                  autoFocus
                  autoComplete="off"
                  disabled={phase === 'provisioning'}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="client-site.com"
                  value={domain}
                  className="bg-[#121214] border-[#232328] text-white text-xs placeholder:text-muted-foreground focus:border-[#5c4df0]/50"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Use the final production domain. Maxmark will build the document root
                  under `/maxmark_sites/{normalizedPreview || 'client-site.com'}`.
                </p>
                {errorMessage ? (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-amber-200">Provisioning Error</p>
                      <p className="text-amber-300/90 leading-relaxed text-[11px]">{errorMessage}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-[#232328] bg-[#121214] p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-[#5c4df0]" />
                  Provisioning preview
                </div>
                <div className="space-y-3 text-[11px]">
                  <div className="flex items-start gap-2.5">
                    <div className="rounded bg-[#202024] p-1.5 text-[#5c4df0] border border-[#2d2d34] shrink-0">
                      <Globe className="h-3.5 w-3.5" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[9px] uppercase font-semibold text-muted-foreground block">
                        Domain root
                      </span>
                      <p className="font-semibold text-white truncate">
                        {normalizedPreview || 'client-site.com'}
                      </p>
                      <p className="text-muted-foreground truncate font-mono text-[10px]">
                        /maxmark_sites/{normalizedPreview || 'client-site.com'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="rounded bg-[#202024] p-1.5 text-[#5c4df0] border border-[#2d2d34] shrink-0">
                      <Database className="h-3.5 w-3.5" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[9px] uppercase font-semibold text-muted-foreground block">
                        MySQL seed
                      </span>
                      <p className="font-semibold text-white font-mono truncate">
                        {toDbPreview(normalizedPreview || 'client-site.com')}
                      </p>
                      <p className="text-muted-foreground leading-snug">
                        Provisioned with a dedicated user and full privileges.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {phase === 'provisioning' ? (
              <div className="space-y-4 rounded-lg border border-[#232328] bg-[#121214] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Provisioning in progress
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Maxmark is safely running the mocked infrastructure workflow.
                    </p>
                  </div>
                  <LoaderCircle className="h-5 w-5 animate-spin text-[#5c4df0]" />
                </div>
                <Progress className="bg-[#202024] [&>div]:bg-[#5c4df0]" value={progressValue} />
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {steps.map((step) => (
                    <div
                      className="flex items-start justify-between gap-4 rounded border border-[#232328] bg-[#161619] px-3.5 py-2.5"
                      key={step.id}
                    >
                      <div>
                        <p className="text-xs font-semibold text-white">
                          {step.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {step.description}
                        </p>
                      </div>
                      <span
                        className={`inline-block border px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                          step.state === 'completed'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                            : step.state === 'in_progress'
                              ? 'border-[#5c4df0]/30 bg-[#5c4df0]/10 text-[#5c4df0]'
                              : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
                        }`}
                      >
                        {step.state.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2">
              <button
                disabled={phase === 'provisioning'}
                onClick={() => handleOpenChange(false)}
                type="button"
                className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={phase === 'provisioning' || !domain.trim()}
                type="submit"
                className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition disabled:opacity-50"
              >
                {phase === 'provisioning' ? 'Provisioning...' : 'Create new site'}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

