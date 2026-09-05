import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Download, Pencil, Plus, Trash2 } from 'lucide-react'

import {
  createDnsRecord,
  deleteDnsRecord,
  fetchDnsRecords,
  fetchDnsZone,
  updateDnsRecord,
  type DnsRecord,
  type DnsRecordInput,
  type DnsRecordType,
  type DnsZone,
} from '@/lib/db/dns-zones'
import { buildBindZoneFile } from '@/lib/dns-export'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ErrorState, TableSkeleton } from '@/components/ui/ui-states'

const RECORD_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV']
const FALLBACK_NAMESERVERS = ['ns1.maxmark.com.ng', 'ns2.maxmark.com.ng']

const VALUE_PLACEHOLDER: Record<DnsRecordType, string> = {
  A: '192.0.2.1',
  AAAA: '2001:db8::1',
  CNAME: 'target.example.com',
  MX: 'mail.example.com',
  TXT: 'v=spf1 mx a ~all',
  NS: 'ns1.example.com',
  SRV: '_service._tcp.example.com',
}

interface FormState {
  id: string | null
  type: DnsRecordType
  name: string
  value: string
  ttl: string
  priority: string
}

const emptyForm: FormState = { id: null, type: 'A', name: '', value: '', ttl: '3600', priority: '' }

function isProtectedRecord(record: DnsRecord): boolean {
  return record.name === '@' && (record.type === 'A' || record.type === 'NS')
}

export function DnsZoneDetailPage() {
  const { zoneId } = useParams()
  const [zone, setZone] = useState<DnsZone | null>(null)
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function load() {
    if (!supabase || !zoneId) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      const [z, r] = await Promise.all([fetchDnsZone(sb, zoneId), fetchDnsRecords(sb, zoneId)])
      setZone(z)
      setRecords(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DNS zone could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId])

  function openCreate() {
    setForm(emptyForm)
    setFormError('')
    setDialogOpen(true)
  }

  function openEdit(record: DnsRecord) {
    setForm({
      id: record.id,
      type: record.type,
      name: record.name,
      value: record.value,
      ttl: String(record.ttl),
      priority: record.priority != null ? String(record.priority) : '',
    })
    setFormError('')
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!supabase || !zoneId) return
    const ttl = Number(form.ttl)
    const priority = form.priority.trim() ? Number(form.priority) : null

    if (!form.name.trim()) {
      setFormError('Name is required (use @ for the zone root).')
      return
    }
    if (!form.value.trim()) {
      setFormError('Value is required.')
      return
    }
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
      setFormError('TTL must be a whole number between 60 and 86400 seconds.')
      return
    }
    if (form.type === 'MX' && (priority === null || !Number.isInteger(priority))) {
      setFormError('MX records require a whole-number priority.')
      return
    }

    const input: DnsRecordInput = {
      type: form.type,
      name: form.name.trim(),
      value: form.value.trim(),
      ttl,
      priority,
    }

    setBusy(true)
    setFormError('')
    try {
      if (form.id) {
        await updateDnsRecord(supabase, form.id, input)
      } else {
        await createDnsRecord(supabase, zoneId, input)
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The record could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(record: DnsRecord) {
    if (!supabase) return
    const message = isProtectedRecord(record)
      ? `"${record.name}" is a ${record.type} record at the zone root — deleting it can take ${zone?.zoneName ?? 'this domain'} offline. Delete anyway?`
      : `Delete this ${record.type} record for "${record.name}"?`
    if (!window.confirm(message)) return

    setBusy(true)
    try {
      await deleteDnsRecord(supabase, record.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The record could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  function handleExport() {
    if (!zone) return
    const content = buildBindZoneFile(zone.zoneName, records)
    const blob = new Blob([content], { type: 'text/dns' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${zone.zoneName}.zone`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopyNameservers() {
    const live = records.filter((r) => r.type === 'NS').map((r) => r.value)
    navigator.clipboard.writeText((live.length ? live : FALLBACK_NAMESERVERS).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <TableSkeleton rows={5} />
      </div>
    )
  }

  if (error || !zone) {
    return (
      <ErrorState
        title="DNS Zone Loading Failed"
        message="We were unable to load this DNS zone."
        error={error ?? 'Zone not found.'}
        onRetry={() => void load()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground text-left">
        <Link className="hover:text-white transition" to="/home">
          Home
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <Link className="hover:text-white transition" to="/dns-zones">
          DNS Zones
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span> <span className="text-white">{zone.zoneName}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/dns-zones"
            className="text-muted-foreground hover:text-white transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-white">{zone.zoneName}</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyNameservers}
            className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white flex items-center gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            Copy Nameservers
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export BIND Zone File
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Record
          </button>
        </div>
      </div>

      {/* Records table */}
      <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Value</th>
                <th className="px-5 py-3 font-semibold">TTL</th>
                <th className="px-5 py-3 font-semibold">Priority</th>
                <th className="px-5 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232328] text-xs text-white">
              {records.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={6}>
                    No DNS records yet.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr className="hover:bg-[#1c1c20] transition" key={record.id}>
                    <td className="px-5 py-4">
                      <span className="inline-block border border-[#2d2d34] bg-[#202024] px-2 py-0.5 rounded text-[10px] font-semibold">
                        {record.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono">{record.name}</td>
                    <td className="px-5 py-4 font-mono text-muted-foreground truncate max-w-xs">{record.value}</td>
                    <td className="px-5 py-4 text-muted-foreground">{record.ttl}s</td>
                    <td className="px-5 py-4 text-muted-foreground">{record.priority ?? '—'}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(record)}
                          className="text-muted-foreground hover:text-white transition"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void handleDelete(record)}
                          className="text-muted-foreground hover:text-red-400 transition disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / edit record dialog */}
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="bg-[#161619] border border-[#232328] text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit record' : 'Add DNS record'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              Changes take effect on live DNS immediately — there is no staging step.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            {formError ? (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-300" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Type
                </label>
                <select
                  className="w-full bg-[#121214] border border-[#232328] rounded-md px-3 py-2 text-white focus:border-[#5c4df0]/50"
                  onChange={(e) => setForm({ ...form, type: e.target.value as DnsRecordType })}
                  value={form.type}
                >
                  {RECORD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Name
                </label>
                <input
                  className="w-full bg-[#121214] border border-[#232328] rounded-md px-3 py-2 text-white placeholder:text-muted-foreground focus:border-[#5c4df0]/50"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="@ or www"
                  value={form.name}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Value
              </label>
              <input
                className="w-full bg-[#121214] border border-[#232328] rounded-md px-3 py-2 text-white placeholder:text-muted-foreground focus:border-[#5c4df0]/50 font-mono"
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={VALUE_PLACEHOLDER[form.type]}
                value={form.value}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  TTL (seconds)
                </label>
                <input
                  className="w-full bg-[#121214] border border-[#232328] rounded-md px-3 py-2 text-white focus:border-[#5c4df0]/50"
                  onChange={(e) => setForm({ ...form, ttl: e.target.value })}
                  value={form.ttl}
                />
              </div>
              {form.type === 'MX' && (
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Priority
                  </label>
                  <input
                    className="w-full bg-[#121214] border border-[#232328] rounded-md px-3 py-2 text-white focus:border-[#5c4df0]/50"
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    placeholder="10"
                    value={form.priority}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <button
              className="px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white"
              onClick={() => setDialogOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
