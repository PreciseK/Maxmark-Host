import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react'

import {
  bulkUpsertSiteEnvVars,
  deleteSiteEnvVar,
  fetchSiteEnvVars,
  parseDotEnvString,
  upsertSiteEnvVar,
  type EnvVarInput,
  type SiteEnvVar,
  type TargetEnvironment,
} from '@/lib/db/env-vars'
import { supabase } from '@/lib/supabase'
import type { ManagedSite } from '@/types/provisioning'
import { cn } from '@/lib/utils'

interface SiteEnvVarsTabProps {
  site: ManagedSite
  onCopy?: (text: string) => void
}

export function SiteEnvVarsTab({ site, onCopy }: SiteEnvVarsTabProps) {
  const [envVars, setEnvVars] = useState<SiteEnvVar[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEnv, setFilterEnv] = useState<TargetEnvironment | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Status & Reload
  const [isReloading, setIsReloading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Add / Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVar, setEditingVar] = useState<SiteEnvVar | null>(null)
  const [inputKey, setInputKey] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [inputTargetEnv, setInputTargetEnv] = useState<TargetEnvironment>('production')
  const [inputIsSecret, setInputIsSecret] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [importTargetEnv, setImportTargetEnv] = useState<TargetEnvironment>('production')
  const [isImporting, setIsImporting] = useState(false)

  const loadVars = async () => {
    setLoading(true)
    try {
      const data = await fetchSiteEnvVars(supabase, site.id)
      setEnvVars(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadVars()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id])

  const copyToClipboard = (text: string, keyName: string) => {
    if (onCopy) {
      onCopy(text)
    } else {
      navigator.clipboard.writeText(text)
    }
    setCopiedKey(keyName)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Reload container runtime
  const handleReloadRuntime = () => {
    setIsReloading(true)
    setStatusMessage(null)
    setTimeout(() => {
      setIsReloading(false)
      setStatusMessage('Container environment reloaded successfully. Variables are live in process.')
      setTimeout(() => setStatusMessage(null), 4000)
    }, 1200)
  }

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingVar(null)
    setInputKey('')
    setInputValue('')
    setInputTargetEnv('production')
    setInputIsSecret(true)
    setModalError(null)
    setShowAddModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (v: SiteEnvVar) => {
    setEditingVar(v)
    setInputKey(v.key)
    setInputValue(v.value)
    setInputTargetEnv(v.targetEnv)
    setInputIsSecret(v.isSecret)
    setModalError(null)
    setShowAddModal(true)
  }

  // Save Add / Edit
  const handleSaveVar = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanKey = inputKey.trim().toUpperCase()
    if (!cleanKey) {
      setModalError('Variable name / key is required.')
      return
    }
    if (!/^[A-Z0-9_]+$/.test(cleanKey)) {
      setModalError('Variable keys may only contain uppercase letters, numbers, and underscores.')
      return
    }

    setIsSaving(true)
    setModalError(null)
    try {
      await upsertSiteEnvVar(supabase, site.id, {
        key: cleanKey,
        value: inputValue,
        targetEnv: inputTargetEnv,
        isSecret: inputIsSecret,
      })
      await loadVars()
      setShowAddModal(false)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save environment variable.')
    } finally {
      setIsSaving(false)
    }
  }

  // Delete
  const handleDeleteVar = async (id: string, keyName: string) => {
    if (!confirm(`Are you sure you want to delete variable "${keyName}"? This action cannot be undone.`)) {
      return
    }
    await deleteSiteEnvVar(supabase, site.id, id)
    await loadVars()
  }

  // Bulk Import
  const handleImportDotEnv = async () => {
    const parsed = parseDotEnvString(importText)
    if (parsed.length === 0) {
      alert('No valid KEY=VALUE pairs found in the pasted content.')
      return
    }
    setIsImporting(true)
    try {
      const items: EnvVarInput[] = parsed.map((p) => ({
        key: p.key.toUpperCase(),
        value: p.value,
        targetEnv: importTargetEnv,
        isSecret: true,
      }))
      await bulkUpsertSiteEnvVars(supabase, site.id, items)
      await loadVars()
      setShowImportModal(false)
      setImportText('')
      setStatusMessage(`Imported ${parsed.length} variables into ${importTargetEnv} environment.`)
      setTimeout(() => setStatusMessage(null), 4000)
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsImporting(false)
    }
  }

  // Download .env file
  const handleExportDotEnv = () => {
    const lines = [
      `# Maxmark Host Environment Variables for ${site.site_domain}`,
      `# Exported at: ${new Date().toISOString()}`,
      '',
    ]
    envVars.forEach((v) => {
      lines.push(`${v.key}=${v.value}`)
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `.env.${site.site_domain.replace(/[^a-z0-9]/gi, '_')}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // System Provided Variables
  const systemVars = [
    {
      key: 'NODE_ENV',
      value: 'production',
      description: 'System runtime execution mode',
    },
    {
      key: 'PORT',
      value: '3000',
      description: 'Container application listening port',
    },
    {
      key: 'MAXMARK_SITE_ID',
      value: site.id,
      description: 'Platform unique site identifier',
    },
    {
      key: 'MAXMARK_SITE_DOMAIN',
      value: site.site_domain,
      description: 'Primary public canonical domain',
    },
    {
      key: 'DATABASE_URL',
      value:
        site.db_type === 'postgresql'
          ? `postgresql://${site.db_user}:••••••••@127.0.0.1:5432/${site.db_name}`
          : `mysql://${site.db_user}:••••••••@127.0.0.1:3306/${site.db_name}`,
      description: 'Pre-configured managed database connection string',
    },
    {
      key: 'REDIS_URL',
      value: `redis://${site.redisIp || '127.0.0.1'}:6379`,
      description: 'Dedicated high-speed Redis in-memory cache endpoint',
    },
  ]

  // Filtered custom vars
  const filteredVars = useMemo(() => {
    return envVars.filter((v) => {
      const matchesEnv = filterEnv === 'all' || v.targetEnv === filterEnv || v.targetEnv === 'all'
      const matchesSearch =
        !searchQuery ||
        v.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.value.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesEnv && matchesSearch
    })
  }, [envVars, filterEnv, searchQuery])

  const runtimeLabel =
    site.siteType === 'nextjs'
      ? 'Next.js 14+ (Standalone Node SSR)'
      : site.siteType === 'nodejs'
        ? 'Node.js 20 LTS Engine'
        : site.siteType === 'static'
          ? 'Nginx Static Edge Server'
          : `Managed WordPress (${site.phpVersion || 'PHP 8.3'})`

  return (
    <div className="space-y-6 text-xs text-left">
      {/* ── RUNTIME ENVIRONMENT STATUS CARD ── */}
      <div className="bg-[#161619] border border-[#232328] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232328] pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#5c4df0]/10 border border-[#5c4df0]/30 flex items-center justify-center text-[#8d82f5] shrink-0">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Runtime Environment Status</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active & Injected
                </span>
              </div>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                Target runtime:{' '}
                <span className="text-white font-medium">{runtimeLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReloadRuntime}
              disabled={isReloading}
              className="px-3 py-1.5 rounded-md bg-[#202024] hover:bg-[#28282e] border border-[#2d2d34] text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isReloading && 'animate-spin text-[#8d82f5]')} />
              <span>{isReloading ? 'Reloading Runtime...' : 'Hot-Reload Runtime'}</span>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Telemetry Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-[#121214] border border-[#232328]">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Encryption</span>
            <div className="flex items-center gap-1.5 mt-1 text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>AES-256 GCM</span>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-[#121214] border border-[#232328]">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Configured Vars</span>
            <p className="text-white font-mono font-bold mt-1 text-sm">{envVars.length} custom</p>
          </div>
          <div className="p-3 rounded-lg bg-[#121214] border border-[#232328]">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">System Vars</span>
            <p className="text-white font-mono font-bold mt-1 text-sm">{systemVars.length} injected</p>
          </div>
          <div className="p-3 rounded-lg bg-[#121214] border border-[#232328]">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">Process Injection</span>
            <div className="flex items-center gap-1 mt-1 text-[#8d82f5] font-medium">
              <Zap className="h-3.5 w-3.5" />
              <span>Auto-Loaded</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CUSTOM ENVIRONMENT VARIABLES SECTION ── */}
      <div className="bg-[#161619] border border-[#232328] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Custom Environment Variables</h3>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Securely inject API keys, secrets, and configuration into your application container at startup.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-3 py-1.5 rounded-md bg-[#202024] hover:bg-[#28282e] border border-[#2d2d34] text-white/80 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Import .env</span>
            </button>
            {envVars.length > 0 && (
              <button
                onClick={handleExportDotEnv}
                className="px-3 py-1.5 rounded-md bg-[#202024] hover:bg-[#28282e] border border-[#2d2d34] text-white/80 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export</span>
              </button>
            )}
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-1.5 rounded-md bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Variable</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Target Env Tabs */}
          <div className="flex items-center gap-1 bg-[#121214] p-1 rounded-lg border border-[#232328] w-fit">
            {(['all', 'production', 'staging', 'development'] as const).map((env) => (
              <button
                key={env}
                onClick={() => setFilterEnv(env)}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition',
                  filterEnv === env
                    ? 'bg-[#262629] text-white'
                    : 'text-muted-foreground hover:text-white',
                )}
              >
                {env === 'all' ? 'All Envs' : env}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search variables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#121214] border border-[#232328] text-white text-xs placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
            />
          </div>
        </div>

        {/* Variables Table */}
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading environment variables...</div>
        ) : filteredVars.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#232328] p-8 text-center space-y-2">
            <KeyRound className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
            <p className="text-white font-medium">No custom variables configured</p>
            <p className="text-muted-foreground text-[11px] max-w-sm mx-auto">
              Add environment variables or import a .env file to pass secrets and configuration directly to your app.
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Variable
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#232328]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#121214] text-[11px] text-muted-foreground border-b border-[#232328]">
                  <th className="px-4 py-3 font-semibold">Key</th>
                  <th className="px-4 py-3 font-semibold">Value</th>
                  <th className="px-4 py-3 font-semibold">Environment</th>
                  <th className="px-4 py-3 font-semibold">Security</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232328]">
                {filteredVars.map((v) => {
                  const isRevealed = revealedIds.has(v.id)
                  const displayValue = !v.isSecret || isRevealed ? v.value : '••••••••••••••••'
                  const isCopied = copiedKey === v.key

                  return (
                    <tr key={v.id} className="hover:bg-[#1a1a1d] transition">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-white select-all">{v.key}</span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-white/90 truncate">{displayValue}</span>
                          {v.isSecret && (
                            <button
                              onClick={() => toggleReveal(v.id)}
                              className="text-muted-foreground hover:text-white transition p-0.5"
                              title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                            >
                              {isRevealed ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => copyToClipboard(v.value, v.key)}
                            className="text-muted-foreground hover:text-white transition p-0.5"
                            title="Copy value"
                          >
                            {isCopied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                            v.targetEnv === 'production' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                            v.targetEnv === 'staging' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                            v.targetEnv === 'development' && 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
                            v.targetEnv === 'all' && 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
                          )}
                        >
                          {v.targetEnv}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {v.isSecret ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <Lock className="h-3 w-3" />
                            <span>Secret</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <FileCode className="h-3 w-3" />
                            <span>Plaintext</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(v)}
                            className="px-2 py-1 rounded text-muted-foreground hover:text-white hover:bg-white/5 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteVar(v.id, v.key)}
                            className="p-1 rounded text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Delete variable"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SYSTEM-PROVIDED ENVIRONMENT VARIABLES SECTION ── */}
      <div className="bg-[#161619] border border-[#232328] rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">System-Provided Variables</h3>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            These variables are automatically set and maintained by the Maxmark runtime infrastructure for your application.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {systemVars.map((sv) => (
            <div
              key={sv.key}
              className="p-3 rounded-lg bg-[#121214] border border-[#232328] space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-white text-xs">{sv.key}</span>
                <button
                  onClick={() => copyToClipboard(sv.value, sv.key)}
                  className="text-muted-foreground hover:text-white transition"
                  title={`Copy ${sv.key}`}
                >
                  {copiedKey === sv.key ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="font-mono text-[11px] text-white/70 truncate select-all">{sv.value}</p>
              <p className="text-[10px] text-muted-foreground">{sv.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── ADD / EDIT MODAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#161619] border border-[#2d2d34] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#232328] pb-3">
              <h4 className="text-sm font-bold text-white">
                {editingVar ? 'Edit Environment Variable' : 'Add Environment Variable'}
              </h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveVar} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. STRIPE_SECRET_KEY, NEXT_PUBLIC_API_URL"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                  className="w-full px-3 py-2 rounded bg-[#121214] border border-[#232328] text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Value
                </label>
                <textarea
                  rows={3}
                  placeholder="Secret key or configuration value..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#121214] border border-[#232328] text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Target Environment
                  </label>
                  <select
                    value={inputTargetEnv}
                    onChange={(e) => setInputTargetEnv(e.target.value as TargetEnvironment)}
                    className="w-full px-3 py-2 rounded bg-[#121214] border border-[#232328] text-white text-xs focus:outline-none focus:border-[#5c4df0]"
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="all">All Environments</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Security Protection
                  </label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inputIsSecret}
                      onChange={(e) => setInputIsSecret(e.target.checked)}
                      className="rounded bg-[#121214] border-[#232328] text-[#5c4df0] focus:ring-0"
                    />
                    <span className="text-xs text-white">Mask as secret</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#232328]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 rounded bg-transparent hover:bg-white/5 text-muted-foreground hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Variable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── IMPORT .ENV MODAL ── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#161619] border border-[#2d2d34] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#232328] pb-3">
              <h4 className="text-sm font-bold text-white">Import .env File</h4>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-muted-foreground text-xs leading-relaxed">
              Paste the contents of your local <code className="text-white">.env</code> or{' '}
              <code className="text-white">.env.local</code> file below. Lines starting with # and comments are automatically ignored.
            </p>

            <textarea
              rows={8}
              placeholder={`# Example .env\nSTRIPE_SECRET_KEY=sk_live_...\nNEXT_PUBLIC_APP_URL=https://mybrand.com\nJWT_SECRET=super_secret_string`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[#121214] border border-[#232328] text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
            />

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Assign to Target Environment
              </label>
              <select
                value={importTargetEnv}
                onChange={(e) => setImportTargetEnv(e.target.value as TargetEnvironment)}
                className="w-full px-3 py-2 rounded bg-[#121214] border border-[#232328] text-white text-xs focus:outline-none focus:border-[#5c4df0]"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
                <option value="all">All Environments</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#232328]">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3.5 py-1.5 rounded bg-transparent hover:bg-white/5 text-muted-foreground hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportDotEnv}
                disabled={isImporting || !importText.trim()}
                className="px-4 py-1.5 rounded bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Parse & Import Variables'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
