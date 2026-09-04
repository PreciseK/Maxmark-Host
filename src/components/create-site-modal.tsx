import { startTransition, useDeferredValue, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Globe,
  LoaderCircle,
  Server,
  Sparkles,
  Triangle,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { GitHubRepoPicker } from '@/components/github-repo-picker'
import { updateGitConfig } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import { provisionSite } from '@/services/provisioningService'
import type { DbType, ManagedSite, ProvisioningStep, SiteType } from '@/types/provisioning'
import { WordPressLogo } from '@/components/icons/wordpress-logo'

interface CreateSiteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingDomains?: string[]
  initialDomain?: string
  onSiteCreated: (site: ManagedSite) => void
}

interface SiteTypeOption {
  type: SiteType
  label: string
  tagline: string
  icon: React.ReactNode
  accentColor: string
  borderColor: string
  glowColor: string
  showDb: boolean
  dbLabel: string
  docLabel: string
}

const SITE_TYPE_OPTIONS: SiteTypeOption[] = [
  {
    type: 'wordpress',
    label: 'WordPress',
    tagline: 'Full CMS with MySQL database',
    icon: <WordPressLogo className="h-5 w-5 text-[#0073aa]" />,
    accentColor: 'text-[#0073aa]',
    borderColor: 'border-[#0073aa]/40',
    glowColor: 'bg-[#0073aa]/10',
    showDb: true,
    dbLabel: 'MySQL database provisioned',
    docLabel: 'Document root + WP core installed',
  },
  {
    type: 'nextjs',
    label: 'Next.js',
    tagline: 'SSR / SSG with Node.js runtime',
    icon: <Triangle className="h-5 w-5 fill-white text-white" />,
    accentColor: 'text-white',
    borderColor: 'border-white/30',
    glowColor: 'bg-white/5',
    showDb: false,
    dbLabel: 'Node.js App Manager configured',
    docLabel: 'Document root + Node.js runtime',
  },
  {
    type: 'static',
    label: 'Static Site',
    tagline: 'HTML / SPA — no server runtime',
    icon: <Globe className="h-5 w-5 text-sky-400" />,
    accentColor: 'text-sky-400',
    borderColor: 'border-sky-400/30',
    glowColor: 'bg-sky-400/5',
    showDb: false,
    dbLabel: 'No database needed',
    docLabel: 'Document root + Apache file serving',
  },
  {
    type: 'nodejs',
    label: 'Node.js App',
    tagline: 'Custom server — Express, Fastify…',
    icon: <Zap className="h-5 w-5 text-green-400" />,
    accentColor: 'text-green-400',
    borderColor: 'border-green-400/30',
    glowColor: 'bg-green-400/5',
    showDb: false,
    dbLabel: 'Node.js App Manager configured',
    docLabel: 'Document root + Node.js runtime',
  },
]

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
  const [siteType, setSiteType] = useState<SiteType>('wordpress')
  const [databaseChoice, setDatabaseChoice] = useState<DbType>('none')
  const [githubRepoUrl, setGithubRepoUrl] = useState('')
  const [githubBranch, setGithubBranch] = useState('main')
  const [step, setStep] = useState<'pick-type' | 'configure' | 'provisioning' | 'success'>('pick-type')
  const [domain, setDomain] = useState('')
  const [steps, setSteps] = useState<ProvisioningStep[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [createdSite, setCreatedSite] = useState<ManagedSite | null>(null)
  const [gitConfigWarning, setGitConfigWarning] = useState('')
  const deferredDomain = useDeferredValue(domain)
  const normalizedPreview = sanitizeDomain(deferredDomain)
  const completedSteps = steps.filter((s) => s.state === 'completed').length
  const progressValue = steps.length ? (completedSteps / steps.length) * 100 : 0

  const selectedTypeOption = SITE_TYPE_OPTIONS.find((o) => o.type === siteType)!
  const effectiveDatabase: DbType = siteType === 'wordpress' ? 'mysql' : databaseChoice

  function resetState() {
    setSiteType('wordpress')
    setDatabaseChoice('none')
    setGithubRepoUrl('')
    setGithubBranch('main')
    setStep('pick-type')
    setDomain('')
    setSteps([])
    setErrorMessage('')
    setCreatedSite(null)
    setGitConfigWarning('')
  }

  function handleOpenChange(nextOpen: boolean) {
    if (step === 'provisioning' && !nextOpen) return
    if (!nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setStep('provisioning')
    setSteps([])

    try {
      const site = await provisionSite(domain, {
        existingDomains: existingDomains ?? [],
        siteType,
        database: effectiveDatabase,
        onProgress: setSteps,
      })

      if (githubRepoUrl && supabase) {
        try {
          await updateGitConfig(supabase, site.id, {
            githubRepoUrl,
            githubBranch,
            autoDeployEnabled: true,
          })
        } catch (gitErr) {
          setGitConfigWarning(
            gitErr instanceof Error
              ? `The site was created, but linking the GitHub repository failed: ${gitErr.message}. You can connect it from the site's Git & CI/CD tab.`
              : "The site was created, but linking the GitHub repository failed. You can connect it from the site's Git & CI/CD tab.",
          )
        }
      }

      setCreatedSite(site)
      setStep('success')
      startTransition(() => onSiteCreated(site))
    } catch (error) {
      setStep('configure')
      setErrorMessage(
        error instanceof Error ? error.message : 'Provisioning did not complete.',
      )
    }
  }

  // ── Step 1: Type picker ──────────────────────────────────────────────────────
  const renderTypePicker = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <span className="inline-block border border-[#2d2d34] bg-[#202024] text-white px-2 py-0.5 rounded text-[10px] font-semibold uppercase">
            Step 1 of 2
          </span>
        </div>
        <DialogTitle className="text-white text-lg font-bold mt-2">
          What kind of site are you creating?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
          All sites are provisioned on cPanel infrastructure. Choose the runtime that fits your project.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3 mt-2">
        {SITE_TYPE_OPTIONS.map((option) => (
          <button
            key={option.type}
            type="button"
            onClick={() => setSiteType(option.type)}
            className={`
              relative text-left rounded-lg border p-4 transition-all duration-200
              ${siteType === option.type
                ? `${option.borderColor} ${option.glowColor} ring-1 ring-inset ${option.borderColor}`
                : 'border-[#232328] bg-[#121214] hover:border-[#3d3d44] hover:bg-[#1a1a1e]'
              }
            `}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`rounded-md p-1.5 border border-[#2d2d34] bg-[#202024]`}>
                {option.icon}
              </div>
              <span className="text-sm font-semibold text-white">{option.label}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{option.tagline}</p>
            {siteType === option.type && (
              <div className={`absolute top-3 right-3 h-2 w-2 rounded-full ${option.accentColor.replace('text-', 'bg-')}`} />
            )}
          </button>
        ))}
      </div>

      <DialogFooter className="mt-2">
        <button
          onClick={() => handleOpenChange(false)}
          type="button"
          className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => setStep('configure')}
          className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white flex items-center gap-1.5 transition"
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </DialogFooter>
    </>
  )

  // ── Step 2 + provisioning + success ──────────────────────────────────────────
  const renderConfigure = () => (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <span className="inline-block border border-[#2d2d34] bg-[#202024] text-white px-2 py-0.5 rounded text-[10px] font-semibold uppercase">
            Step 2 of 2
          </span>
          <span className={`inline-flex items-center gap-1 border ${selectedTypeOption.borderColor} ${selectedTypeOption.glowColor} px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${selectedTypeOption.accentColor}`}>
            {selectedTypeOption.label}
          </span>
        </div>
        <DialogTitle className="text-white text-lg font-bold mt-2">
          Configure your {selectedTypeOption.label} site
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
          Maxmark will place the domain on the lowest-load cPanel account and unlock your dashboard as soon as provisioning finishes.
        </DialogDescription>
      </DialogHeader>

      <form className="space-y-6 text-xs" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="space-y-2">
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
                disabled={step === 'provisioning'}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="client-site.com"
                value={domain}
                className="bg-[#121214] border-[#232328] text-white text-xs placeholder:text-muted-foreground focus:border-[#5c4df0]/50"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Use the final production domain. Maxmark will build the document root
                under `/maxmark_sites/{normalizedPreview || 'client-site.com'}`.
              </p>
            </div>

            {siteType !== 'wordpress' && (
              <div className="space-y-2 pt-1 border-t border-[#232328]/60">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  Database engine
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={step === 'provisioning'}
                    onClick={() => setDatabaseChoice('none')}
                    className={`px-3 py-2 rounded-md border text-left transition ${
                      databaseChoice === 'none'
                        ? 'border-[#5c4df0] bg-[#5c4df0]/10 text-white font-semibold'
                        : 'border-[#232328] bg-[#121214] text-muted-foreground hover:border-[#3d3d44] hover:text-white'
                    }`}
                  >
                    <div className="text-[11px] font-medium">None</div>
                    <div className="text-[9px] opacity-75">No database</div>
                  </button>
                  <button
                    type="button"
                    disabled={step === 'provisioning'}
                    onClick={() => setDatabaseChoice('mysql')}
                    className={`px-3 py-2 rounded-md border text-left transition ${
                      databaseChoice === 'mysql'
                        ? 'border-[#5c4df0] bg-[#5c4df0]/10 text-white font-semibold'
                        : 'border-[#232328] bg-[#121214] text-muted-foreground hover:border-[#3d3d44] hover:text-white'
                    }`}
                  >
                    <div className="text-[11px] font-medium">MySQL</div>
                    <div className="text-[9px] opacity-75">MariaDB / MySQL</div>
                  </button>
                  <button
                    type="button"
                    disabled={step === 'provisioning'}
                    onClick={() => setDatabaseChoice('postgresql')}
                    className={`px-3 py-2 rounded-md border text-left transition ${
                      databaseChoice === 'postgresql'
                        ? 'border-[#5c4df0] bg-[#5c4df0]/10 text-white font-semibold'
                        : 'border-[#232328] bg-[#121214] text-muted-foreground hover:border-[#3d3d44] hover:text-white'
                    }`}
                  >
                    <div className="text-[11px] font-medium">PostgreSQL</div>
                    <div className="text-[9px] opacity-75">cPanel Postgres</div>
                  </button>
                </div>
              </div>
            )}

            {siteType !== 'wordpress' && (
              <div className="space-y-2 pt-2 border-t border-[#232328]/60">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  GitHub Repository (Vercel-Style Auto-Deploy)
                </label>
                <GitHubRepoPicker
                  currentRepoUrl={githubRepoUrl}
                  currentBranch={githubBranch}
                  onSelect={({ repoUrl, branch }) => {
                    setGithubRepoUrl(repoUrl)
                    setGithubBranch(branch)
                  }}
                />
              </div>
            )}

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
                  {effectiveDatabase !== 'none' ? (
                    <Database className="h-3.5 w-3.5" />
                  ) : (
                    <Server className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground block">
                    {effectiveDatabase !== 'none' ? `${effectiveDatabase === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Database` : 'Runtime'}
                  </span>
                  {effectiveDatabase !== 'none' ? (
                    <>
                      <p className="font-semibold text-white font-mono truncate">
                        {toDbPreview(normalizedPreview || 'client-site.com')}
                      </p>
                      <p className="text-muted-foreground leading-snug">
                        Provisioned with a dedicated user and full privileges.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-white truncate">
                        {selectedTypeOption.label}
                      </p>
                      <p className="text-muted-foreground leading-snug">
                        {selectedTypeOption.dbLabel}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {step === 'provisioning' ? (
          <div className="space-y-4 rounded-lg border border-[#232328] bg-[#121214] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white">
                  Provisioning in progress
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Maxmark is safely running the infrastructure workflow.
                </p>
              </div>
              <LoaderCircle className="h-5 w-5 animate-spin text-[#5c4df0]" />
            </div>
            <Progress className="bg-[#202024] [&>div]:bg-[#5c4df0]" value={progressValue} />
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {steps.map((s) => (
                <div
                  className="flex items-start justify-between gap-4 rounded border border-[#232328] bg-[#161619] px-3.5 py-2.5"
                  key={s.id}
                >
                  <div>
                    <p className="text-xs font-semibold text-white">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>
                  </div>
                  <span
                    className={`inline-block border px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                      s.state === 'completed'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                        : s.state === 'in_progress'
                          ? 'border-[#5c4df0]/30 bg-[#5c4df0]/10 text-[#5c4df0]'
                          : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
                    }`}
                  >
                    {s.state.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <button
            disabled={step === 'provisioning'}
            onClick={() => setStep('pick-type')}
            type="button"
            className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white disabled:opacity-50"
          >
            ← Back
          </button>
          <button
            disabled={step === 'provisioning' || !domain.trim()}
            type="submit"
            className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition disabled:opacity-50"
          >
            {step === 'provisioning' ? 'Provisioning...' : `Create ${selectedTypeOption.label} site`}
          </button>
        </DialogFooter>
      </form>
    </>
  )

  // ── Success state ────────────────────────────────────────────────────────────
  const renderSuccess = () => (
    <div className="space-y-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500 shrink-0">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-white">
            {createdSite?.site_domain} is live in Maxmark
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {selectedTypeOption.type === 'wordpress'
              ? 'The site is provisioned with its own database and isolated document root. You can jump straight into the site dashboard now.'
              : `The site document root is ready on the cPanel node. ${selectedTypeOption.type === 'static' ? 'Deploy your files via FTP/SFTP.' : 'Upload your app files and configure the startup command via cPanel.'}`
            }
          </p>
        </div>
      </div>
      {gitConfigWarning ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-amber-300/90 leading-relaxed text-[11px]">{gitConfigWarning}</p>
        </div>
      ) : null}
      <div className={`grid gap-3 text-xs ${selectedTypeOption.showDb ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div className="rounded-md border border-[#232328] bg-[#121214] p-4 space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Domain</span>
          <p className="font-semibold text-white truncate">{createdSite?.site_domain}</p>
        </div>
        {selectedTypeOption.showDb && (
          <div className="rounded-md border border-[#232328] bg-[#121214] p-4 space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Database</span>
            <p className="font-semibold text-white font-mono truncate">{createdSite?.db_name}</p>
          </div>
        )}
        <div className="rounded-md border border-[#232328] bg-[#121214] p-4 space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Root</span>
          <p className="font-semibold text-white font-mono truncate" title={createdSite?.document_root}>
            {createdSite?.document_root}
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
          to={`/sites/${createdSite?.id}`}
          className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition"
        >
          Open site dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </DialogFooter>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#161619] border border-[#232328] text-white max-w-2xl">
        {step === 'pick-type' && renderTypePicker()}
        {(step === 'configure' || step === 'provisioning') && renderConfigure()}
        {step === 'success' && createdSite && renderSuccess()}
      </DialogContent>
    </Dialog>
  )
}
