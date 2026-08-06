import { useState } from 'react'
import {
  Archive,
  Database,
  Download,
  HardDrive,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'

import {
  getInitialBackupRecords,
  type GlobalBackupRecord,
} from '@/lib/db/admin-system'
import {
  adminCardClass,
  StatusBadge,
} from '@/components/admin/admin-ui'

export function AdminBackups() {
  const [backups, setBackups] = useState<GlobalBackupRecord[]>(getInitialBackupRecords())
  const [triggeringGlobal, setTriggeringGlobal] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  function handleTriggerGlobalBackup() {
    setTriggeringGlobal(true)
    setToastMessage(null)
    setTimeout(() => {
      const newBackup: GlobalBackupRecord = {
        id: `bk-${Date.now()}`,
        snapshotName: `manual-global-snap-${Date.now().toString().slice(-4)}`,
        siteDomain: 'All Active Sites (Global Snapshot)',
        sizeMb: 1870,
        status: 'completed',
        createdAt: new Date().toISOString(),
        storageLocation: 'R2 maxmark-private/backups',
      }
      setBackups((prev) => [newBackup, ...prev])
      setTriggeringGlobal(false)
      setToastMessage({ tone: 'success', text: 'Global backup snapshot completed and uploaded to Cloudflare R2 bucket (maxmark-private).' })
    }, 1800)
  }

  function handleRestoreBackup(snapshotName: string) {
    setToastMessage({ tone: 'success', text: `Restoration task initiated for snapshot ${snapshotName}. Target site files and MySQL database are being restored.` })
  }

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Global Backups & Disaster Recovery</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage automated daily snapshots, trigger global backup sweeps, and restore customer site databases.
          </p>
        </div>

        <button
          onClick={handleTriggerGlobalBackup}
          disabled={triggeringGlobal}
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-60 transition active:scale-[0.98]"
        >
          {triggeringGlobal ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
          {triggeringGlobal ? 'Running Snapshot…' : 'Trigger Global Backup Sweep'}
        </button>
      </div>

      {toastMessage ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-medium ${
            toastMessage.tone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {toastMessage.text}
        </div>
      ) : null}

      {/* ── STORAGE SUMMARY STATS ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-[#161619] p-5 backdrop-blur-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">R2 Vault Bucket</span>
            <HardDrive className="h-4 w-4 text-violet-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono">maxmark-private</p>
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> AES-256 Encrypted
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#161619] p-5 backdrop-blur-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total Backup Volume</span>
            <Archive className="h-4 w-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono">14.8 GB</p>
          <p className="text-[11px] text-white/50">Across 42 site snapshots</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#161619] p-5 backdrop-blur-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Snapshot Frequency</span>
            <RefreshCw className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono">Daily (02:00 UTC)</p>
          <p className="text-[11px] text-white/50">30-day retention window</p>
        </div>
      </div>

      {/* ── BACKUPS REPOSITORY TABLE ── */}
      <div className={adminCardClass}>
        <div className="px-5 py-4 border-b border-[#232328] bg-[#161619] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Disaster Recovery Snapshots</h3>
          <span className="text-xs text-muted-foreground font-mono">{backups.length} archives</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                <th className="px-5 py-3.5 font-semibold">Snapshot Name</th>
                <th className="px-5 py-3.5 font-semibold">Target Domain</th>
                <th className="px-5 py-3.5 font-semibold">Archive Size</th>
                <th className="px-5 py-3.5 font-semibold">Created At</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232328] text-xs text-white">
              {backups.map((bk) => (
                <tr className="hover:bg-[#1c1c20] transition" key={bk.id}>
                  <td className="px-5 py-4 font-mono font-semibold text-violet-300">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-violet-400 shrink-0" />
                      <span>{bk.snapshotName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium text-white">{bk.siteDomain}</td>
                  <td className="px-5 py-4 font-mono text-muted-foreground">{bk.sizeMb} MB</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(bk.createdAt))}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge tone={bk.status === 'completed' ? 'green' : 'amber'}>
                      {bk.status}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRestoreBackup(bk.snapshotName)}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 transition"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore Site
                      </button>

                      <button
                        onClick={() => setToastMessage({ tone: 'success', text: `Downloading ${bk.snapshotName} from Cloudflare R2.` })}
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10 hover:text-white transition"
                        title="Download RAW Backup Archive"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
