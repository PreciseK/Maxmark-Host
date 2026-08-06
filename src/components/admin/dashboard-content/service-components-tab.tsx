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
  SERVICE_STATUS_LABELS,
  fetchAllServiceComponents,
  type ServiceComponent,
  type ServiceStatus,
} from '@/lib/db/service-status'
import { adminAction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

const STATUSES: ServiceStatus[] = [
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
  'maintenance',
]

interface FormState {
  id: string | null
  name: string
  description: string
  status: ServiceStatus
  sortOrder: string
  published: boolean
}

const emptyForm: FormState = {
  id: null,
  name: '',
  description: '',
  status: 'operational',
  sortOrder: '0',
  published: true,
}

export function ServiceComponentsTab() {
  const [components, setComponents] = useState<ServiceComponent[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!supabase) return
    try {
      setComponents(await fetchAllServiceComponents(supabase))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Components could not be loaded.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(component: ServiceComponent) {
    setForm({
      id: component.id,
      name: component.name,
      description: component.description,
      status: component.status,
      sortOrder: String(component.sortOrder),
      published: component.published,
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!supabase) return
    const sortOrder = Number(form.sortOrder)
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999) {
      setError('Sort order must be a whole number between 0 and 999.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await adminAction(supabase, {
        action: 'upsert_service_component',
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
        sortOrder,
        published: form.published,
      })
      setDialogOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The component could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(component: ServiceComponent) {
    if (!supabase) return
    if (!window.confirm(`Delete "${component.name}"? This cannot be undone.`)) return

    setBusy(true)
    try {
      await adminAction(supabase, { action: 'delete_service_component', id: component.id })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The component could not be deleted.')
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
            Add Component
          </button>
        }
        title="Service Components"
      >
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Name</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Order</th>
              <th className={thClass}>Published</th>
              <th className={thClass}></th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {components.length === 0 ? (
              <EmptyRow colSpan={5} message="No service components yet." />
            ) : (
              components.map((component) => (
                <tr className={rowClass} key={component.id}>
                  <td className={cellClass}>
                    <div className="font-medium text-white">{component.name}</div>
                    <div className="text-[10px] text-muted-foreground">{component.description}</div>
                  </td>
                  <td className={cellClass}>{SERVICE_STATUS_LABELS[component.status]}</td>
                  <td className={cellClass}>{component.sortOrder}</td>
                  <td className={cellClass}>{component.published ? 'Yes' : 'No'}</td>
                  <td className={cellClass}>
                    <div className="flex gap-2">
                      <button className={secondaryButtonClass} onClick={() => openEdit(component)} type="button">
                        Edit
                      </button>
                      <button
                        className={secondaryButtonClass}
                        disabled={busy}
                        onClick={() => void handleDelete(component)}
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
              {form.id ? 'Edit component' : 'Add service component'}
            </DialogTitle>
            <DialogDescription>
              Components appear on the customer dashboard in sort order. Status drives both the
              row indicator and the overall banner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
              <div>
                <label className={fieldLabelClass} htmlFor="component-name">Name</label>
                <input
                  className={fieldInputClass}
                  id="component-name"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  value={form.name}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="component-description">Description</label>
                <textarea
                  className={fieldInputClass}
                  id="component-description"
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  value={form.description}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="component-status">Status</label>
                <select
                  className={fieldInputClass}
                  id="component-status"
                  onChange={(e) => setForm({ ...form, status: e.target.value as ServiceStatus })}
                  value={form.status}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {SERVICE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="component-order">Sort Order</label>
                <input
                  className={fieldInputClass}
                  id="component-order"
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  value={form.sortOrder}
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
