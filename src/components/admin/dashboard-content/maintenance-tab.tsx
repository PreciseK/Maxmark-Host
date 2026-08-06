import { useEffect, useState } from 'react'

import {
  EmptyRow,
  TableCard,
  adminDialogClass,
  cellClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  tbodyClass,
  thClass,
  theadRowClass,
  tableClass,
} from '@/components/admin/admin-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MAINTENANCE_STATE_LABELS,
  deriveWindowState,
  fetchAllMaintenanceWindows,
  type MaintenanceWindow,
} from '@/lib/db/maintenance'
import { adminAction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

interface FormState {
  id: string | null
  title: string
  body: string
  startsAt: string
  endsAt: string
  published: boolean
}

const emptyForm: FormState = {
  id: null,
  title: '',
  body: '',
  startsAt: '',
  endsAt: '',
  published: false,
}

/** datetime-local yields "YYYY-MM-DDTHH:mm"; the action expects ISO-8601. */
function toIso(localValue: string): string {
  return new Date(localValue).toISOString()
}

/** Inverse of toIso, for populating the edit form. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MaintenanceTab() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = new Date()

  async function load() {
    if (!supabase) return
    try {
      setWindows(await fetchAllMaintenanceWindows(supabase))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Maintenance windows could not be loaded.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(item: MaintenanceWindow) {
    setForm({
      id: item.id,
      title: item.title,
      body: item.body,
      startsAt: toLocalInput(item.startsAt),
      endsAt: toLocalInput(item.endsAt),
      published: item.published,
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!supabase) return
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and body are required.')
      return
    }
    if (form.title.trim().length > 160) {
      setError('Title must be 160 characters or fewer.')
      return
    }
    if (form.body.trim().length > 2_000) {
      setError('Body must be 2,000 characters or fewer.')
      return
    }
    if (!form.startsAt || !form.endsAt) {
      setError('Start and end times are required.')
      return
    }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError('The window must end after it starts.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await adminAction(supabase, {
        action: 'upsert_maintenance_window',
        ...(form.id ? { id: form.id } : {}),
        title: form.title.trim(),
        body: form.body.trim(),
        startsAt: toIso(form.startsAt),
        endsAt: toIso(form.endsAt),
        published: form.published,
      })
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The window could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(item: MaintenanceWindow) {
    if (!supabase) return
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return

    setBusy(true)
    try {
      await adminAction(supabase, { action: 'delete_maintenance_window', id: item.id })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The window could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <TableCard
        actions={
          <button className={primaryButtonClass} onClick={openCreate} type="button">
            Add Window
          </button>
        }
        title="Maintenance Windows"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Title</th>
              <th className={thClass}>Window</th>
              <th className={thClass}>State</th>
              <th className={thClass}>Published</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {windows.length === 0 ? (
              <EmptyRow colSpan={5} message="No maintenance windows yet." />
            ) : (
              windows.map((item) => (
                <tr className={rowClass} key={item.id}>
                  <td className={cellClass}>
                    <div className="font-medium text-white">{item.title}</div>
                    <div className="text-[10px] text-muted-foreground">{item.body}</div>
                  </td>
                  <td className={cellClass}>
                    {new Date(item.startsAt).toLocaleString()} — {new Date(item.endsAt).toLocaleString()}
                  </td>
                  <td className={cellClass}>
                    {MAINTENANCE_STATE_LABELS[deriveWindowState(item, now)]}
                  </td>
                  <td className={cellClass}>{item.published ? 'Yes' : 'No'}</td>
                  <td className={cellClass}>
                    <div className="flex gap-2">
                      <button className={secondaryButtonClass} onClick={() => openEdit(item)} type="button">
                        Edit
                      </button>
                      <button
                        className={secondaryButtonClass}
                        disabled={busy}
                        onClick={() => void handleDelete(item)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableCard>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">
              {form.id ? 'Edit window' : 'Add maintenance window'}
            </DialogTitle>
            <DialogDescription>
              Scheduled, in progress, and completed are derived from these times. Published
              windows disappear from the dashboard 24 hours after they end.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
              <div>
                <label className={fieldLabelClass} htmlFor="window-title">Title</label>
                <input
                  className={fieldInputClass}
                  id="window-title"
                  maxLength={160}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  value={form.title}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="window-body">Body</label>
                <textarea
                  className={fieldInputClass}
                  id="window-body"
                  maxLength={2_000}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={3}
                  value={form.body}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="window-starts">Starts</label>
                <input
                  className={fieldInputClass}
                  id="window-starts"
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  type="datetime-local"
                  value={form.startsAt}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="window-ends">Ends</label>
                <input
                  className={fieldInputClass}
                  id="window-ends"
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  type="datetime-local"
                  value={form.endsAt}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white">
                <input
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  type="checkbox"
                />
                Published
              </label>
          </div>

          <DialogFooter>
            <button className={secondaryButtonClass} onClick={() => setDialogOpen(false)} type="button">
              Cancel
            </button>
            <button className={primaryButtonClass} disabled={busy} onClick={() => void handleSubmit()} type="button">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
