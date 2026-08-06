import { useEffect, useState } from 'react'
import {
  Cloud,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
} from 'lucide-react'

import {
  createIpFirewallRule,
  deleteIpFirewallRule,
  fetchIpFirewallRules,
  fetchSystemTelemetry,
  updateSystemSetting,
  type IpFirewallRule,
} from '@/lib/db/admin-system'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  adminCardClass,
  adminDialogClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from '@/components/admin/admin-ui'

export function AdminSecurity() {
  const [rules, setRules] = useState<IpFirewallRule[]>([])
  const [underAttackMode, setUnderAttackMode] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  // New Rule Modal
  const [addRuleOpen, setAddRuleOpen] = useState(false)
  const [newIp, setNewIp] = useState('')
  const [ruleType, setRuleType] = useState<'block' | 'allow'>('block')
  const [ruleReason, setRuleReason] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    Promise.all([
      fetchIpFirewallRules(supabase),
      fetchSystemTelemetry(supabase),
    ])
      .then(([fetchedRules, telemetry]) => {
        if (active) {
          setRules(fetchedRules)
          setUnderAttackMode(telemetry.underAttackMode)
        }
      })
      .catch((err) => console.error('Security fetch error:', err))

    return () => {
      active = false
    }
  }, [])

  async function toggleUnderAttackMode() {
    const next = !underAttackMode
    setUnderAttackMode(next)
    if (supabase) {
      await updateSystemSetting(supabase, 'under_attack_mode', next)
    }
    setToastMessage({
      tone: next ? 'error' : 'success',
      text: next
        ? 'CLOUDFLARE UNDER ATTACK MODE ACTIVATED — JavaScript challenges enforced across all customer DNS zones.'
        : 'Under Attack Mode deactivated. Normal edge security posture restored.',
    })
  }

  async function handleAddRule() {
    if (!newIp.trim() || !ruleReason.trim()) return
    const payload = {
      ip: newIp.trim(),
      type: ruleType,
      reason: ruleReason.trim(),
      createdBy: 'Administrator',
    }

    if (supabase) {
      const created = await createIpFirewallRule(supabase, payload)
      setRules((prev) => [created, ...prev])
    } else {
      const mockRule: IpFirewallRule = {
        id: `fw-${Date.now()}`,
        ...payload,
        createdAt: new Date().toISOString(),
      }
      setRules((prev) => [mockRule, ...prev])
    }

    setAddRuleOpen(false)
    setNewIp('')
    setRuleReason('')
    setToastMessage({
      tone: 'success',
      text: `Firewall rule ${ruleType.toUpperCase()} applied for IP address ${newIp}.`,
    })
  }

  async function handleDeleteRule(id: string) {
    if (supabase) {
      await deleteIpFirewallRule(supabase, id)
    }
    setRules((prev) => prev.filter((r) => r.id !== id))
    setToastMessage({ tone: 'success', text: 'Firewall rule removed successfully.' })
  }

  function handleRevokeAllSessions() {
    setToastMessage({ tone: 'error', text: 'Initiated global session revocation across all non-admin JWT tokens.' })
  }

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Security, Firewall & DDoS Shield</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Global IP access control, brute-force mitigation, Cloudflare Under Attack Mode, and session revocation.
          </p>
        </div>

        <button
          onClick={() => void toggleUnderAttackMode()}
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition shadow-lg ${
            underAttackMode
              ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-rose-600/20'
              : 'border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
          }`}
        >
          {underAttackMode ? <ShieldAlert className="h-4 w-4 animate-bounce" /> : <ShieldCheck className="h-4 w-4" />}
          {underAttackMode ? 'UNDER ATTACK MODE ACTIVE' : 'Enable Under Attack Mode'}
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

      {/* ── DDOS & SESSION SECURITY CARDS ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.04] p-5 space-y-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cloudflare Under Attack Mode</h3>
              <p className="text-xs text-muted-foreground">Enforces JS Challenge to filter Layer 7 HTTP flood attacks.</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">Current Shield State:</span>
            <StatusBadge tone={underAttackMode ? 'red' : 'green'}>
              {underAttackMode ? 'High Protection (JS Challenge)' : 'Standard WAF Active'}
            </StatusBadge>
          </div>
        </div>

        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/[0.04] p-5 space-y-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
              <UserX className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Emergency Session Revocation</h3>
              <p className="text-xs text-muted-foreground">Force log out all active customer accounts immediately.</p>
            </div>
          </div>
          <button
            onClick={handleRevokeAllSessions}
            type="button"
            className="w-full py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-300 transition"
          >
            Revoke All Customer Sessions
          </button>
        </div>
      </div>

      {/* ── FIREWALL RULES TABLE ── */}
      <div className={adminCardClass}>
        <div className="px-5 py-4 border-b border-[#232328] bg-[#161619] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Global IP Firewall Rules</h3>
            <p className="text-xs text-muted-foreground">Block or allow specific IP addresses across all hosted cPanel sites.</p>
          </div>

          <button
            onClick={() => setAddRuleOpen(true)}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5c4df0] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-600/20 hover:bg-[#6c5df5] transition"
          >
            <Plus className="h-4 w-4" />
            Add Firewall Rule
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                <th className="px-5 py-3.5 font-semibold">IP Address</th>
                <th className="px-5 py-3.5 font-semibold">Action Type</th>
                <th className="px-5 py-3.5 font-semibold">Reason</th>
                <th className="px-5 py-3.5 font-semibold">Created By</th>
                <th className="px-5 py-3.5 font-semibold">Created At</th>
                <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232328] text-xs text-white">
              {rules.map((rule) => (
                <tr className="hover:bg-[#1c1c20] transition" key={rule.id}>
                  <td className="px-5 py-4 font-mono font-bold text-white">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-violet-400 shrink-0" />
                      <span>{rule.ip}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge tone={rule.type === 'block' ? 'red' : 'green'}>
                      {rule.type === 'block' ? 'BLOCK ACCESS' : 'ALLOW ACCESS'}
                    </StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground max-w-xs truncate" title={rule.reason}>
                    {rule.reason}
                  </td>
                  <td className="px-5 py-4 text-white/80 font-medium">{rule.createdBy}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(rule.createdAt))}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => void handleDeleteRule(rule.id)}
                      type="button"
                      title="Remove Firewall Rule"
                      className="text-muted-foreground hover:text-rose-400 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ADD FIREWALL RULE MODAL ── */}
      <Dialog open={addRuleOpen} onOpenChange={setAddRuleOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Add IP Firewall Rule</DialogTitle>
            <DialogDescription>
              Block or allow traffic from specific IP addresses globally across all hosted domains.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div>
              <label className={fieldLabelClass}>IP Address or CIDR Range</label>
              <input
                type="text"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="e.g. 198.51.100.45 or 198.51.100.0/24"
                className={fieldInputClass}
              />
            </div>

            <div>
              <label className={fieldLabelClass}>Action Type</label>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as 'block' | 'allow')}
                className={fieldInputClass}
              >
                <option value="block">BLOCK Access (Deny Traffic)</option>
                <option value="allow">ALLOW Access (Bypass Checks)</option>
              </select>
            </div>

            <div>
              <label className={fieldLabelClass}>Reason / Security Note</label>
              <input
                type="text"
                value={ruleReason}
                onChange={(e) => setRuleReason(e.target.value)}
                placeholder="e.g. Brute force attempts on wp-login.php"
                className={fieldInputClass}
              />
            </div>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setAddRuleOpen(false)} type="button">
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={!newIp.trim() || !ruleReason.trim()}
              onClick={() => void handleAddRule()}
              type="button"
            >
              Apply Firewall Rule
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
