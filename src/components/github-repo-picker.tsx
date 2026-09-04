import { useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  Github,
  Key,
  LoaderCircle,
  Lock,
  Search,
  Unlock,
} from 'lucide-react'

import {
  connectWithGitHubOAuth,
  disconnectGitHub,
  getGitHubConnectionStatus,
  listRepoBranches,
  listUserRepos,
  saveGitHubToken,
  type GitHubBranch,
  type GitHubRepo,
} from '@/services/githubService'
import { supabase } from '@/lib/supabase'

interface GitHubRepoPickerProps {
  currentRepoUrl?: string | null
  currentBranch?: string
  onSelect: (selection: { repoUrl: string; branch: string }) => void
}

export function GitHubRepoPicker({
  currentRepoUrl,
  currentBranch = 'main',
  onSelect,
}: GitHubRepoPickerProps) {
  const [checkingConnection, setCheckingConnection] = useState(true)
  const [connected, setConnected] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [savingToken, setSavingToken] = useState(false)

  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [selectedBranch, setSelectedBranch] = useState(currentBranch)
  const [loadingBranches, setLoadingBranches] = useState(false)

  // On mount: if a fresh GitHub OAuth session just landed, save its
  // provider_token server-side once. Otherwise check whether a connection
  // already exists from a prior session. The token itself is never held in
  // client state — only the resulting connected/disconnected status is.
  useEffect(() => {
    if (!supabase) {
      setCheckingConnection(false)
      return
    }
    const sb = supabase
    let cancelled = false

    async function load() {
      try {
        const { data: { session } } = await sb.auth.getSession()
        const providerToken = session?.provider_token
        if (providerToken) {
          await saveGitHubToken(sb, providerToken)
          if (!cancelled) setConnected(true)
          return
        }
        const status = await getGitHubConnectionStatus(sb)
        if (!cancelled) setConnected(status)
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to check GitHub connection')
        }
      } finally {
        if (!cancelled) setCheckingConnection(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Load repositories once connected
  useEffect(() => {
    if (!connected || !supabase) return
    const sb = supabase
    let cancelled = false

    async function load() {
      setLoadingRepos(true)
      setErrorMsg('')
      try {
        const data = await listUserRepos(sb)
        if (cancelled) return
        setRepos(data)
        // Auto match currentRepoUrl if already set
        if (currentRepoUrl) {
          const matched = data.find(
            (r) =>
              r.htmlUrl.toLowerCase() === currentRepoUrl.toLowerCase() ||
              r.cloneUrl.toLowerCase() === currentRepoUrl.toLowerCase(),
          )
          if (matched) {
            setSelectedRepo(matched)
          }
        }
      } catch (err) {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch repositories')
      } finally {
        if (!cancelled) setLoadingRepos(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [connected, currentRepoUrl])

  // Load branches when a repo is selected
  useEffect(() => {
    if (!selectedRepo || !connected || !supabase) return
    const sb = supabase
    const repo = selectedRepo
    let cancelled = false

    async function load() {
      setLoadingBranches(true)
      try {
        const bData = await listRepoBranches(sb, repo.owner, repo.name)
        if (cancelled) return
        setBranches(bData)
        if (bData.some((b) => b.name === selectedBranch)) {
          // Keep current branch
        } else if (bData.some((b) => b.name === repo.defaultBranch)) {
          setSelectedBranch(repo.defaultBranch)
        } else if (bData.length > 0) {
          setSelectedBranch(bData[0].name)
        }
      } catch {
        if (cancelled) return
        setBranches([{ name: repo.defaultBranch || 'main' }])
      } finally {
        if (!cancelled) setLoadingBranches(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [selectedRepo, connected])

  const handleOAuthConnect = async () => {
    if (!supabase) return
    try {
      await connectWithGitHubOAuth(supabase)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'GitHub OAuth failed')
    }
  }

  const handleSaveManualToken = async () => {
    if (!tokenInput.trim() || !supabase) return
    const clean = tokenInput.trim()
    setSavingToken(true)
    setErrorMsg('')
    try {
      await saveGitHubToken(supabase, clean)
      setConnected(true)
      setTokenInput('')
      setShowTokenInput(false)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save GitHub token')
    } finally {
      setSavingToken(false)
    }
  }

  const handleDisconnect = async () => {
    if (!supabase) return
    try {
      await disconnectGitHub(supabase)
    } catch {
      /* best-effort: still clear local UI state below */
    }
    setConnected(false)
    setRepos([])
    setSelectedRepo(null)
  }

  const handleConfirmSelection = (repo: GitHubRepo, branch: string) => {
    onSelect({
      repoUrl: repo.htmlUrl,
      branch,
    })
  }

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.fullName.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  if (checkingConnection) {
    return (
      <div className="py-8 text-center space-y-2 rounded-lg border border-[#232328] bg-[#121214]">
        <LoaderCircle className="h-5 w-5 animate-spin text-[#5c4df0] mx-auto" />
        <p className="text-xs text-muted-foreground">Checking GitHub connection…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-xs text-left">
      {/* ── State 1: Disconnected — OAuth / Token prompt ── */}
      {!connected ? (
        <div className="rounded-lg border border-[#232328] bg-[#121214] p-5 space-y-4 text-center">
          <div className="h-10 w-10 rounded-full border border-[#2d2d34] bg-[#202024] flex items-center justify-center mx-auto text-white">
            <Github className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white">Connect to GitHub</h4>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Link your GitHub account to import repositories and enable automated CI/CD deployments.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <button
              onClick={handleOAuthConnect}
              type="button"
              className="w-full sm:w-auto px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white text-xs font-semibold rounded-md border border-[#2d2d34] transition flex items-center justify-center gap-2 shadow"
            >
              <Github className="h-4 w-4" />
              Connect with GitHub
            </button>

            <button
              onClick={() => setShowTokenInput(!showTokenInput)}
              type="button"
              className="text-xs text-muted-foreground hover:text-white transition flex items-center gap-1"
            >
              <Key className="h-3.5 w-3.5" />
              Use Personal Access Token
            </button>
          </div>

          {showTokenInput && (
            <div className="pt-3 border-t border-[#232328] max-w-sm mx-auto space-y-2 text-left">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground block">
                GitHub Token (classic or fine-grained)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_..."
                  disabled={savingToken}
                  className="flex-1 bg-[#161619] border border-[#232328] rounded-md px-3 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:border-[#5c4df0]"
                />
                <button
                  type="button"
                  disabled={savingToken}
                  onClick={() => void handleSaveManualToken()}
                  className="px-3 py-1.5 bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold rounded-md transition disabled:opacity-50"
                >
                  {savingToken ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <p className="text-amber-400 text-[11px] leading-relaxed pt-1">{errorMsg}</p>
          )}
        </div>
      ) : (
        /* ── State 2: Connected — Repository Selector ── */
        <div className="space-y-4">
          {/* Account status header */}
          <div className="flex items-center justify-between rounded-lg border border-[#232328] bg-[#121214] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <Github className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium text-white">GitHub Account Connected</span>
            </div>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              className="text-[11px] text-muted-foreground hover:text-red-400 transition"
            >
              Disconnect
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your repositories…"
              className="w-full bg-[#121214] border border-[#232328] rounded-md pl-9 pr-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:border-[#5c4df0]"
            />
          </div>

          {loadingRepos ? (
            <div className="py-8 text-center space-y-2 rounded-lg border border-[#232328] bg-[#121214]">
              <LoaderCircle className="h-5 w-5 animate-spin text-[#5c4df0] mx-auto" />
              <p className="text-xs text-muted-foreground">Loading repositories from GitHub…</p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
              {errorMsg}
            </div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1">
              {filteredRepos.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-xs rounded-lg border border-[#232328] bg-[#121214]">
                  No repositories found matching "{searchQuery}"
                </div>
              ) : (
                filteredRepos.map((repo) => {
                  const isSelected = selectedRepo?.id === repo.id
                  return (
                    <div
                      key={repo.id}
                      className={`
                        rounded-lg border p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3
                        ${
                          isSelected
                            ? 'border-[#5c4df0] bg-[#5c4df0]/10 ring-1 ring-[#5c4df0]/40'
                            : 'border-[#232328] bg-[#121214] hover:border-[#3d3d44] hover:bg-[#161619]'
                        }
                      `}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-xs truncate">
                            {repo.fullName}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border uppercase ${
                              repo.private
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {repo.private ? (
                              <>
                                <Lock className="h-2.5 w-2.5" /> Private
                              </>
                            ) : (
                              <>
                                <Unlock className="h-2.5 w-2.5" /> Public
                              </>
                            )}
                          </span>
                        </div>
                        {repo.description && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {repo.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isSelected ? (
                          <div className="flex items-center gap-2">
                            {/* Branch selector */}
                            <div className="relative">
                              <select
                                value={selectedBranch}
                                onChange={(e) => {
                                  setSelectedBranch(e.target.value)
                                  handleConfirmSelection(repo, e.target.value)
                                }}
                                disabled={loadingBranches}
                                className="bg-[#202024] border border-[#2d2d34] text-white text-[11px] rounded px-2 py-1 pr-6 appearance-none font-mono focus:border-[#5c4df0]"
                              >
                                {branches.map((b) => (
                                  <option key={b.name} value={b.name}>
                                    {b.name}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="h-3 w-3 absolute right-1.5 top-2 text-muted-foreground pointer-events-none" />
                            </div>

                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded">
                              <Check className="h-3.5 w-3.5" />
                              Selected
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRepo(repo)
                              setSelectedBranch(repo.defaultBranch || 'main')
                              handleConfirmSelection(repo, repo.defaultBranch || 'main')
                            }}
                            className="px-3 py-1.5 bg-[#202024] hover:bg-[#2c2c32] border border-[#2d2d34] text-white text-xs font-semibold rounded transition"
                          >
                            Import
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
