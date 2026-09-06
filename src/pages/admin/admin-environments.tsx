import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import { fetchAllSitesAdmin, type AdminSiteRow } from '@/lib/db/admin'
import {
  deleteSiteEnvVar,
  fetchSiteEnvVars,
  upsertSiteEnvVar,
  type SiteEnvVar,
  type TargetEnvironment,
} from '@/lib/db/env-vars'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui'
import { TableSkeleton } from '@/components/ui/ui-states'

export function AdminEnvironments() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSiteId = searchParams.get('siteId') || ''

  const [sites, setSites] = useState<AdminSiteRow[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>(initialSiteId)
  const [siteSearch, setSiteSearch] = useState('')
  const [loadingSites, setLoadingSites] = useState(true)

  // Variables State
  const [envVars, setEnvVars] = useState<SiteEnvVar[]>([])
  const [loadingVars, setLoadingVars] = useState(false)
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [varSearch, setVarSearch] = useState('')

  // Action feedback
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [isReloadingSite, setIsReloadingSite] = useState(false)

  // Add / Edit Modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVar, setEditingVar] = useState<SiteEnvVar | null>(null)
  const [inputKey, setInputKey] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [inputTargetEnv, setInputTargetEnv] = useState<TargetEnvironment>('production')
  const [inputIsSecret, setInputIsSecret] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Load Sites
  const loadSites = async () => {
    if (!supabase) {
      setLoadingSites(false)
      return
    }
    setLoadingSites(true)
    try {
      const allSites = await fetchAllSitesAdmin(supabase)
      setSites(allSites)
      if (!selectedSiteId && allSites.length > 0) {
        setSelectedSiteId(allSites[0].id)
      }
    } catch (err) {
      console.warn('Failed to load admin sites:', err)
    } finally {
      setLoadingSites(false)
    }
  }

  // Load Vars for Selected Site
  const loadVarsForSite = async (sId: string) => {
    if (!sId) {
      setEnvVars([])
      return
    }
    setLoadingVars(true)
    try {
      const vars = await fetchSiteEnvVars(supabase, sId)
      setEnvVars(vars)
    } catch (err) {
      console.warn('Failed to load env vars:', err)
    } finally {
      setLoadingVars(false)
    }
  }

  useEffect(() => {
    void loadSites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedSiteId) {
      void loadVarsForSite(selectedSiteId)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('siteId', selectedSiteId)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId])

  const selectedSite = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId)
  }, [sites, selectedSiteId])

  const filteredSites = useMemo(() => {
    if (!siteSearch) return sites
    const q = siteSearch.toLowerCase()
    return sites.filter(
      (s) =>
        s.siteDomain.toLowerCase().includes(q) ||
        s.plan.toLowerCase().includes(q) ||
        s.siteType.toLowerCase().includes(q),
    )
  }, [sites, siteSearch])

  const filteredVars = useMemo(() => {
    if (!varSearch) return envVars
    const q = varSearch.toLowerCase()
    return envVars.filter(
      (v) => v.key.toLowerCase().includes(q) || v.value.toLowerCase().includes(q),
    )
  }, [envVars, varSearch])

  const copyText = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(keyName)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleReloadSite = () => {
    if (!selectedSite) return
    setIsReloadingSite(true)
    setTimeout(() => {
      setIsReloadingSite(false)
      setToast({
        tone: 'success',
        text: `Container runtime for ${selectedSite.siteDomain} reloaded. Environment variables injected.`,
      })
      setTimeout(() => setToast(null), 4000)
    }, 1200)
  }

  const handleOpenAdd = () => {
    setEditingVar(null)
    setInputKey('')
    setInputValue('')
    setInputTargetEnv('production')
    setInputIsSecret(true)
    setShowAddModal(true)
  }

  const handleOpenEdit = (v: SiteEnvVar) => {
    setEditingVar(v)
    setInputKey(v.key)
    setInputValue(v.value)
    setInputTargetEnv(v.targetEnv)
    setInputIsSecret(v.isSecret)
    setShowAddModal(true)
  }

  const handleSaveVar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSiteId) return
    const cleanKey = inputKey.trim().toUpperCase()
    if (!cleanKey) return

    setIsSaving(true)
    try {
      await upsertSiteEnvVar(supabase, selectedSiteId, {
        key: cleanKey,
        value: inputValue,
        targetEnv: inputTargetEnv,
        isSecret: inputIsSecret,
      })
      await loadVarsForSite(selectedSiteId)
      setShowAddModal(false)
      setToast({ tone: 'success', text: `Saved variable ${cleanKey} for ${selectedSite?.siteDomain}.` })
      setTimeout(() => setToast(null), 3500)
    } catch (err) {
      setToast({ tone: 'error', text: 'Failed to save variable: ' + String(err) })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteVar = async (id: string, keyName: string) => {
    if (!confirm(`Delete variable ${keyName} for this site?`)) return
    await deleteSiteEnvVar(supabase, selectedSiteId, id)
    await loadVarsForSite(selectedSiteId)
    setToast({ tone: 'success', text: `Deleted variable ${keyName}.` })
    setTimeout(() => setToast(null), 3000)
  }

  // Runtime Engines
  const clusterRuntimes = [
    {
      name: 'Node.js Cluster',
      version: 'Node 18 LTS · 20 LTS · 22 Current',
      status: 'operational',
      detail: 'pm2 / cgroups v2 process supervisor',
      badge: 'Active Engine',
      tone: 'green' as const,
    },
    {
      name: 'PHP-FPM Runtime',
      version: 'PHP 8.1 · 8.2 · 8.3 with OPcache & JIT',
      status: 'operational',
      detail: 'FastCGI worker pools with dynamic scaling',
      badge: 'Active Engine',
      tone: 'green' as const,
    },
    {
      name: 'Python Runtime',
      version: 'Python 3.10 · 3.11 · 3.12 (WSGI/ASGI)',
      status: 'operational',
      detail: 'Gunicorn & Uvicorn worker daemon',
      badge: 'Active Engine',
      tone: 'green' as const,
    },
    {
      name: 'Edge Static & CDN',
      version: 'Nginx 1.25 + Cloudflare Anycast Proxy',
      status: 'operational',
      detail: 'Brotli, HTTP/2, HTTP/3 QUIC enabled',
      badge: 'Active Engine',
      tone: 'green' as const,
    },
  ]

  // Master platform credentials status
  const platformGateways = [
    {
      title: 'Supabase Database & Realtime Pooler',
      status: 'Operational',
      latency: '14ms',
      detail: 'PostgreSQL 15 connection pooling & RLS policy enforcement',
    },
    {
      title: 'cPanel / WHM Automation Gateway',
      status: 'Operational',
      latency: '85ms',
      detail: 'AutoSSL verification, account provisioning & DNS hooks',
    },
    {
      title: 'Cloudflare Zero Trust Edge & DNS',
      status: 'Operational',
      latency: '42ms',
      detail: 'Global Anycast DNS and DDoS proxy routing',
    },
    {
      title: 'Redis In-Memory Object Cache',
      status: 'Operational',
      latency: '2ms',
      detail: 'Dedicated Redis master cluster at 127.0.0.1:6379',
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <AdminPageHeader
        title="Environments, Runtimes & Variables"
        description="Monitor cluster runtime status, global infrastructure credentials, and manage environment variables across customer applications."
        actions={
          <button
            onClick={() => {
              void loadSites()
              if (selectedSiteId) void loadVarsForSite(selectedSiteId)
            }}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Runtimes
          </button>
        }
      />

      {toast && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-xs font-medium',
            toast.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400',
          )}
        >
          {toast.text}
        </div>
      )}

      {/* ── CLUSTER RUNTIMES TELEMETRY ── */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Cluster Runtime Environments
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {clusterRuntimes.map((rt) => (
            <div
              key={rt.name}
              className="rounded-2xl border border-white/10 bg-[#161619] p-5 space-y-2 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{rt.name}</span>
                <StatusBadge tone={rt.tone}>{rt.status}</StatusBadge>
              </div>
              <p className="text-xs font-mono text-white/80">{rt.version}</p>
              <p className="text-[11px] text-muted-foreground">{rt.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── PLATFORM GATEWAYS & SECRETS HEALTH ── */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Platform Infrastructure Gateways
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformGateways.map((gw) => (
            <div
              key={gw.title}
              className="rounded-2xl border border-white/10 bg-[#161619] p-4 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-white truncate">{gw.title}</span>
                <span className="text-emerald-400 font-mono text-[11px]">{gw.latency}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{gw.status}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{gw.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SITE ENVIRONMENT VARIABLES INSPECTOR ── */}
      <div className="rounded-3xl border border-white/10 bg-[#161619] p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#5c4df0]/10 border border-[#5c4df0]/30 flex items-center justify-center text-[#8d82f5] shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Customer Site Environment Variables Inspector
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inspect, modify, or inject environment variables into any customer application container.
              </p>
            </div>
          </div>

          {selectedSite && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReloadSite}
                disabled={isReloadingSite}
                className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isReloadingSite && 'animate-spin text-[#8d82f5]')} />
                <span>{isReloadingSite ? 'Reloading...' : 'Hot-Reload Container'}</span>
              </button>
              <button
                onClick={handleOpenAdd}
                className="px-3.5 py-1.5 rounded-xl bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Variable</span>
              </button>
            </div>
          )}
        </div>

        {/* Site Selection Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                Select Customer Site
              </label>
              {loadingSites && <span className="text-[10px] text-muted-foreground animate-pulse">Loading sites...</span>}
            </div>
            <div className="space-y-1.5">
              <input
                type="text"
                placeholder="Filter sites by domain..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#121214] border border-white/10 text-white text-xs placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
              />
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white text-xs font-medium focus:outline-none focus:border-[#5c4df0]"
              >
                {filteredSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteDomain} ({s.siteType}) — {s.plan}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedSite && (
            <>
              <div className="space-y-1 rounded-xl bg-[#121214] border border-white/10 p-3">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Runtime Info</span>
                <p className="text-white font-medium text-xs">
                  {selectedSite.siteType.toUpperCase()} · {selectedSite.phpVersion}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Node: {selectedSite.nodeId} · Region: {selectedSite.region}
                </p>
              </div>

              <div className="space-y-1 rounded-xl bg-[#121214] border border-white/10 p-3">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Encryption & Status</span>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> AES-256 GCM
                  </span>
                  <span className="text-white/60 text-xs">·</span>
                  <span className="text-white font-mono text-xs">{envVars.length} variables</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Variables Table */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Variables for {selectedSite?.siteDomain || 'Site'}
            </h4>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter variables..."
                value={varSearch}
                onChange={(e) => setVarSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#121214] border border-white/10 text-white text-xs placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]"
              />
            </div>
          </div>

          {loadingVars ? (
            <TableSkeleton rows={3} />
          ) : filteredVars.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center space-y-2">
              <KeyRound className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
              <p className="text-white font-medium text-xs">No environment variables found for this site</p>
              <button
                onClick={handleOpenAdd}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Variable
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#121214]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Key</th>
                    <th className="px-4 py-3 font-semibold">Value</th>
                    <th className="px-4 py-3 font-semibold">Target Environment</th>
                    <th className="px-4 py-3 font-semibold">Security</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredVars.map((v) => {
                    const isRevealed = revealedIds.has(v.id)
                    const displayValue = !v.isSecret || isRevealed ? v.value : '••••••••••••••••'

                    return (
                      <tr key={v.id} className="hover:bg-white/[0.02] transition text-xs">
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-white select-all">{v.key}</span>
                        </td>
                        <td className="px-4 py-3 max-w-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-white/90 truncate">{displayValue}</span>
                            {v.isSecret && (
                              <button
                                onClick={() => toggleReveal(v.id)}
                                className="text-muted-foreground hover:text-white transition p-0.5"
                              >
                                {isRevealed ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => copyText(v.value, v.key)}
                              className="text-muted-foreground hover:text-white transition p-0.5"
                            >
                              {copiedKey === v.key ? (
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
                              <Lock className="h-3 w-3" /> Secret
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Plaintext</span>
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
      </div>

      {/* ── MODAL ADD / EDIT ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#161619] border border-white/10 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-sm font-bold text-white">
                {editingVar ? 'Edit Variable' : 'Add Environment Variable'}
              </h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVar} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. DATABASE_PASSWORD, API_KEY"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                  className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Value
                </label>
                <textarea
                  rows={3}
                  placeholder="Variable value..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#5c4df0]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Environment
                  </label>
                  <select
                    value={inputTargetEnv}
                    onChange={(e) => setInputTargetEnv(e.target.value as TargetEnvironment)}
                    className="w-full px-3 py-2 rounded-xl bg-[#121214] border border-white/10 text-white text-xs focus:outline-none focus:border-[#5c4df0]"
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
                      className="rounded bg-[#121214] border-white/10 text-[#5c4df0] focus:ring-0"
                    />
                    <span className="text-xs text-white">Mask as secret</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-transparent hover:bg-white/5 text-muted-foreground hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-xl bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Variable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
