import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileCode2,
  GitBranch,
  LoaderCircle,
  Play,
  Radio,
  Terminal,
} from 'lucide-react'

import { GitHubRepoPicker } from '@/components/github-repo-picker'
import { triggerGitDeploy, updateGitConfig } from '@/lib/functions'
import { supabase, supabaseUrl } from '@/lib/supabase'
import { formatDateLabel } from '@/lib/utils'
import type { ManagedSite } from '@/types/provisioning'

interface SiteGitCicdTabProps {
  site: ManagedSite
  onSiteUpdated: (site: ManagedSite) => void
  onCopy: (text: string) => void
}

export function SiteGitCicdTab({ site, onSiteUpdated, onCopy }: SiteGitCicdTabProps) {
  const [githubUrl, setGithubUrl] = useState(site.github_repo_url || '')
  const [githubBranch, setGithubBranch] = useState(site.github_branch || 'main')
  const [autoDeploy, setAutoDeploy] = useState(site.auto_deploy_enabled ?? false)
  const [isSavingGit, setIsSavingGit] = useState(false)
  const [isDeployingGit, setIsDeployingGit] = useState(false)
  const [gitFeedback, setGitFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)

  useEffect(() => {
    setGithubUrl(site.github_repo_url || '')
    setGithubBranch(site.github_branch || 'main')
    setAutoDeploy(site.auto_deploy_enabled ?? false)
  }, [site.github_repo_url, site.github_branch, site.auto_deploy_enabled])

  const handleSaveGitConfig = async () => {
    if (!supabase) return
    setIsSavingGit(true)
    setGitFeedback(null)
    try {
      const res = await updateGitConfig(supabase, site.id, {
        githubRepoUrl: githubUrl.trim() || null,
        githubBranch: githubBranch.trim() || 'main',
        autoDeployEnabled: autoDeploy,
      })
      if (res.site) {
        onSiteUpdated({ ...site, ...res.site })
      }
      setGitFeedback({ kind: 'ok', message: 'Git configuration saved successfully.' })
    } catch (err) {
      setGitFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to save Git configuration.' })
    } finally {
      setIsSavingGit(false)
    }
  }

  const handleTriggerDeploy = async () => {
    if (!supabase) return
    setIsDeployingGit(true)
    setGitFeedback(null)
    try {
      const res = await triggerGitDeploy(supabase, site.id)
      if (res.site) {
        onSiteUpdated({ ...site, ...res.site })
      }
      setGitFeedback({ kind: 'ok', message: 'Deployment triggered successfully!' })
    } catch (err) {
      setGitFeedback({ kind: 'error', message: err instanceof Error ? err.message : 'Deployment failed.' })
    } finally {
      setIsDeployingGit(false)
    }
  }

  const webhookUrl = `${supabaseUrl}/functions/v1/git-deploy?token=${site.deploy_webhook_token || 'unconfigured'}`

  return (
    <div className="space-y-6 text-xs text-left">
      {/* Header Card */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-[#5c4df0]" />
              GitHub Integration & Continuous Deployment
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed mt-1">
              Connect your GitHub repository to enable automated deployments. Every push to your target branch will pull new commits directly into <span className="font-mono text-white">{site.document_root || `/maxmark_sites/${site.site_domain}`}</span>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={isDeployingGit || !githubUrl.trim()}
              onClick={() => void handleTriggerDeploy()}
              className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] text-white text-xs font-semibold rounded-md transition flex items-center gap-2 disabled:opacity-50 shadow"
            >
              {isDeployingGit ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Deploying…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  Deploy Latest Commit
                </>
              )}
            </button>
          </div>
        </div>

        {gitFeedback && (
          <div
            className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
              gitFeedback.kind === 'ok'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {gitFeedback.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            )}
            <p className="leading-relaxed">{gitFeedback.message}</p>
          </div>
        )}

        {/* Status overview row */}
        <div className="grid gap-3 sm:grid-cols-3 pt-3 border-t border-[#232328]">
          <div className="rounded-md border border-[#232328] bg-[#121214] p-3 space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Deployment Status</span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                  site.last_deploy_status === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : site.last_deploy_status === 'deploying'
                      ? 'border-[#5c4df0]/30 bg-[#5c4df0]/10 text-[#5c4df0]'
                      : site.last_deploy_status === 'failed'
                        ? 'border-red-500/30 bg-red-500/10 text-red-400'
                        : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
                }`}
              >
                {site.last_deploy_status || 'idle'}
              </span>
            </div>
          </div>

          <div className="rounded-md border border-[#232328] bg-[#121214] p-3 space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Last Deployed</span>
            <p className="text-white font-mono text-xs font-medium">
              {site.last_deployed_at ? formatDateLabel(site.last_deployed_at) : 'Never'}
            </p>
          </div>

          <div className="rounded-md border border-[#232328] bg-[#121214] p-3 space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Auto-Deploy</span>
            <p className="text-white font-medium text-xs">
              {site.auto_deploy_enabled ? 'Enabled (via Webhook)' : 'Disabled'}
            </p>
          </div>
        </div>
      </div>

      {/* Config Form Card */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-5">
        <h4 className="text-sm font-semibold text-white flex items-center justify-between">
          <span>Repository Settings</span>
          <span className="text-[11px] font-normal text-muted-foreground">Vercel-Style GitHub Integration</span>
        </h4>

        {/* Vercel-Style Interactive GitHub Repo Picker */}
        <GitHubRepoPicker
          currentRepoUrl={githubUrl}
          currentBranch={githubBranch}
          onSelect={({ repoUrl, branch }) => {
            setGithubUrl(repoUrl)
            setGithubBranch(branch)
          }}
        />

        <div className="pt-3 border-t border-[#232328] grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold text-muted-foreground block">
              Selected Repository URL
            </label>
            <input
              type="text"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/org/repo.git"
              className="w-full bg-[#121214] border border-[#232328] rounded-md px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:border-[#5c4df0]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold text-muted-foreground block">
              Target Branch
            </label>
            <input
              type="text"
              value={githubBranch}
              onChange={(e) => setGithubBranch(e.target.value)}
              placeholder="main"
              className="w-full bg-[#121214] border border-[#232328] rounded-md px-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:border-[#5c4df0]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#232328]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDeploy}
              onChange={(e) => setAutoDeploy(e.target.checked)}
              className="rounded border-[#232328] bg-[#121214] text-[#5c4df0] focus:ring-0"
            />
            <span className="text-xs text-white font-medium">Enable Automatic Webhook Deployments</span>
          </label>

          <button
            disabled={isSavingGit}
            onClick={() => void handleSaveGitConfig()}
            className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] text-white text-xs font-semibold rounded-md border border-[#2d2d34] transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSavingGit ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Webhook & CI/CD Workflow Box */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* GitHub Webhook Guide */}
        <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Radio className="h-4 w-4 text-emerald-400" />
            GitHub Webhook Configuration
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Add this Payload URL to your GitHub Repository under <span className="text-white font-medium">Settings → Webhooks</span> to automatically deploy on every push.
          </p>

          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Payload URL</span>
              <div className="flex items-center gap-2 bg-[#121214] border border-[#232328] rounded-md px-3 py-2">
                <span className="font-mono text-[11px] text-white truncate flex-1">
                  {webhookUrl}
                </span>
                <button
                  onClick={() => onCopy(webhookUrl)}
                  className="text-muted-foreground hover:text-white shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Content Type</span>
              <p className="font-mono text-[11px] text-emerald-400 bg-[#121214] border border-[#232328] rounded-md px-3 py-2">
                application/json
              </p>
            </div>
          </div>
        </div>

        {/* GitHub Actions Template */}
        <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-white">
              <FileCode2 className="h-4 w-4 text-[#5c4df0]" />
              GitHub Actions CI/CD Workflow
            </div>
            <button
              onClick={() => onCopy(`name: Maxmark CI/CD Deploy
on:
  push:
    branches: [ ${githubBranch || 'main'} ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Trigger Maxmark Host Deployment
        run: |
          curl -X POST "${webhookUrl}"
`)}
              className="text-xs text-[#5c4df0] hover:underline flex items-center gap-1 font-medium"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Workflow
            </button>
          </div>

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Add <span className="font-mono text-white">.github/workflows/deploy.yml</span> to your repository to trigger builds automatically during CI/CD:
          </p>

          <pre className="bg-[#121214] border border-[#232328] rounded-md p-3 font-mono text-[10px] text-zinc-300 overflow-x-auto leading-relaxed max-h-[140px]">
{`name: Maxmark CI/CD Deploy
on:
  push:
    branches: [ ${githubBranch || 'main'} ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Trigger Maxmark Host Deployment
        run: |
          curl -X POST "${webhookUrl}"`}
          </pre>
        </div>
      </div>

      {/* Deployment Logs Box */}
      {site.last_deploy_log && (
        <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Terminal className="h-4 w-4 text-amber-400" />
            Latest Deployment Output Log
          </div>
          <pre className="bg-[#121214] border border-[#232328] rounded-md p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {site.last_deploy_log}
          </pre>
        </div>
      )}
    </div>
  )
}
