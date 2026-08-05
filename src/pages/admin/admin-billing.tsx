import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'

import { mockAdminBilling, mockAdminUsers } from '@/data/mockAdmin'
import {
  fetchAdminBilling,
  fetchAllProfiles,
  type AdminBillingData,
  type AdminInvoice,
  type AdminProfile,
} from '@/lib/db/admin'
import { adminAction } from '@/lib/functions'
import { useSession } from '@/lib/session-store'
import { isDemoMode, supabase } from '@/lib/supabase'
import { cn, formatCurrency, formatDateLabel } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AdminPageHeader,
  DemoNotice,
  EmptyRow,
  StatusBadge,
  TableCard,
  adminDialogClass,
  cellClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  rowClass,
  secondaryButtonClass,
  tableClass,
  tbodyClass,
  theadRowClass,
  thClass,
  type BadgeTone,
} from '@/components/admin/admin-ui'

const tabs = ['invoices', 'payments', 'orders', 'credits'] as const
type Tab = (typeof tabs)[number]

const invoiceTone: Record<AdminInvoice['status'], BadgeTone> = {
  paid: 'green',
  unpaid: 'amber',
  denied: 'red',
}

interface InvoiceFormState {
  userId: string
  description: string
  totalNgn: string
  dueDate: string
}

const emptyInvoiceForm: InvoiceFormState = {
  userId: '',
  description: '',
  totalNgn: '',
  dueDate: '',
}

export function AdminBilling() {
  const { isDemo } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: Tab = tabs.includes(tabParam as Tab) ? (tabParam as Tab) : 'invoices'

  const [billing, setBilling] = useState<AdminBillingData>(isDemoMode ? mockAdminBilling : { invoices: [], payments: [], orders: [], credits: [] })
  const [profiles, setProfiles] = useState<AdminProfile[]>(isDemoMode ? mockAdminUsers : [])
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormState>(emptyInvoiceForm)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'demo' | 'error' | 'ok'; text?: string } | null>(
    null,
  )

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const [liveBilling, liveProfiles] = await Promise.all([
          fetchAdminBilling(sb),
          fetchAllProfiles(sb),
        ])
        setBilling(liveBilling)
        setProfiles(liveProfiles)
      } catch (error) {
        console.warn('Admin billing fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [])

  const ownerByUser = useMemo(
    () => new Map(profiles.map((p) => [p.userId, p.displayName || p.accountId])),
    [profiles],
  )

  function ownerCell(userId: string) {
    return (
      <Link
        className="text-[#5c4df0] hover:text-[#796ef3] hover:underline"
        to={`/admin/users/${userId}`}
      >
        {ownerByUser.get(userId) ?? userId.slice(0, 8)}
      </Link>
    )
  }

  function setTab(tab: Tab) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  async function handleCreateInvoice() {
    const total = Number(invoiceForm.totalNgn)
    if (
      !invoiceForm.userId ||
      !invoiceForm.description.trim() ||
      !Number.isFinite(total) ||
      total <= 0 ||
      !invoiceForm.dueDate
    ) {
      setFeedback({ kind: 'error', text: 'All invoice fields are required.' })
      return
    }

    if (isDemo || !supabase) {
      setBilling((prev) => ({
        ...prev,
        invoices: [
          {
            id: `demo-inv-${Date.now()}`,
            userId: invoiceForm.userId,
            description: invoiceForm.description.trim(),
            status: 'unpaid',
            dueDate: invoiceForm.dueDate,
            totalNgn: total,
            createdAt: new Date().toISOString(),
          },
          ...prev.invoices,
        ],
      }))
      setInvoiceDialogOpen(false)
      setInvoiceForm(emptyInvoiceForm)
      setFeedback({ kind: 'demo' })
      return
    }

    setBusyId('create-invoice')
    setFeedback(null)
    try {
      const { invoice } = await adminAction<{ invoice: Record<string, unknown> }>(supabase, {
        action: 'create_invoice',
        userId: invoiceForm.userId,
        description: invoiceForm.description.trim(),
        totalNgn: total,
        dueDate: invoiceForm.dueDate,
      })
      setBilling((prev) => ({
        ...prev,
        invoices: [
          {
            id: invoice.id as string,
            userId: invoice.user_id as string,
            description: invoice.description as string,
            status: invoice.status as AdminInvoice['status'],
            dueDate: invoice.due_date as string,
            totalNgn: Number(invoice.total_ngn),
            createdAt: invoice.created_at as string,
          },
          ...prev.invoices,
        ],
      }))
      setInvoiceDialogOpen(false)
      setInvoiceForm(emptyInvoiceForm)
      setFeedback({ kind: 'ok', text: 'Invoice created — the customer sees it as unpaid.' })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Invoice creation failed',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleInvoiceStatus(
    invoice: AdminInvoice,
    status: 'paid' | 'denied',
    recordPayment = false,
  ) {
    if (isDemo || !supabase) {
      setBilling((prev) => ({
        ...prev,
        invoices: prev.invoices.map((i) => (i.id === invoice.id ? { ...i, status } : i)),
      }))
      setFeedback({ kind: 'demo' })
      return
    }

    setBusyId(invoice.id)
    setFeedback(null)
    try {
      await adminAction(supabase, {
        action: 'set_invoice_status',
        invoiceId: invoice.id,
        status,
        recordPayment,
      })
      setBilling((prev) => ({
        ...prev,
        invoices: prev.invoices.map((i) => (i.id === invoice.id ? { ...i, status } : i)),
      }))
      setFeedback({
        kind: 'ok',
        text: `Invoice marked ${status}${recordPayment ? ' with a manual payment recorded' : ''}.`,
      })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Invoice update failed',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <button className={primaryButtonClass} onClick={() => setInvoiceDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create invoice
          </button>
        }
        description="Invoices, payments, orders, and credits across every customer."
        title="Billing"
      />

      {feedback?.kind === 'demo' ? <DemoNotice /> : null}
      {feedback?.kind === 'error' ? (
        <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : null}
      {feedback?.kind === 'ok' ? (
        <p className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
          {feedback.text}
        </p>
      ) : null}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#161618] border border-[#232328] rounded-md p-1 w-fit">
        {tabs.map((tab) => (
          <button
            className={cn(
              'px-4 py-1.5 rounded text-xs font-semibold capitalize transition',
              activeTab === tab
                ? 'bg-[#262629] text-white'
                : 'text-muted-foreground hover:text-white',
            )}
            key={tab}
            onClick={() => setTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'invoices' ? (
        <TableCard footer={<span>{billing.invoices.length} invoices</span>} title="Invoices">
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Customer</th>
                <th className={thClass}>Description</th>
                <th className={thClass}>Due</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {billing.invoices.map((invoice) => (
                <tr className={rowClass} key={invoice.id}>
                  <td className={cellClass}>{ownerCell(invoice.userId)}</td>
                  <td
                    className={`${cellClass} max-w-[260px] truncate`}
                    title={invoice.description}
                  >
                    {invoice.description}
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>{invoice.dueDate}</td>
                  <td className={`${cellClass} font-semibold`}>
                    {formatCurrency(invoice.totalNgn)}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge tone={invoiceTone[invoice.status]}>
                      {invoice.status}
                    </StatusBadge>
                  </td>
                  <td className={cellClass}>
                    {invoice.status === 'unpaid' ? (
                      <div className="flex gap-3">
                        <button
                          className="text-emerald-400 hover:text-emerald-300 font-semibold disabled:opacity-50"
                          disabled={busyId === invoice.id}
                          onClick={() => void handleInvoiceStatus(invoice, 'paid', true)}
                          title="Marks paid and records a manual settlement payment"
                        >
                          Mark paid
                        </button>
                        <button
                          className="text-red-400 hover:text-red-300 font-semibold disabled:opacity-50"
                          disabled={busyId === invoice.id}
                          onClick={() => void handleInvoiceStatus(invoice, 'denied')}
                        >
                          Deny
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {billing.invoices.length === 0 ? (
                <EmptyRow colSpan={6} message="No invoices yet." />
              ) : null}
            </tbody>
          </table>
        </TableCard>
      ) : null}

      {activeTab === 'payments' ? (
        <TableCard footer={<span>{billing.payments.length} payments</span>} title="Payments">
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Customer</th>
                <th className={thClass}>Transaction</th>
                <th className={thClass}>Method</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Paid at</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {billing.payments.map((payment) => (
                <tr className={rowClass} key={payment.id}>
                  <td className={cellClass}>{ownerCell(payment.userId)}</td>
                  <td className={`${cellClass} font-mono text-[10px] text-muted-foreground`}>
                    {payment.transactionId}
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {payment.paymentMethodLabel}
                  </td>
                  <td className={`${cellClass} font-semibold`}>
                    {formatCurrency(payment.amountNgn)}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge
                      tone={
                        payment.status === 'successful'
                          ? 'green'
                          : payment.status === 'failed'
                            ? 'red'
                            : 'zinc'
                      }
                    >
                      {payment.status}
                    </StatusBadge>
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {formatDateLabel(payment.paidAt)}
                  </td>
                </tr>
              ))}
              {billing.payments.length === 0 ? (
                <EmptyRow colSpan={6} message="No payments yet." />
              ) : null}
            </tbody>
          </table>
        </TableCard>
      ) : null}

      {activeTab === 'orders' ? (
        <TableCard footer={<span>{billing.orders.length} orders</span>} title="Orders">
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Customer</th>
                <th className={thClass}>Order ref</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Ordered</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {billing.orders.map((order) => (
                <tr className={rowClass} key={order.id}>
                  <td className={cellClass}>{ownerCell(order.userId)}</td>
                  <td className={`${cellClass} font-mono text-[10px] text-muted-foreground`}>
                    {order.orderRef}
                  </td>
                  <td className={cellClass}>{order.product}</td>
                  <td className={`${cellClass} font-semibold`}>{order.totalLabel}</td>
                  <td className={cellClass}>
                    <StatusBadge tone={order.status === 'active' ? 'green' : 'zinc'}>
                      {order.status}
                    </StatusBadge>
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {formatDateLabel(order.orderedAt)}
                  </td>
                </tr>
              ))}
              {billing.orders.length === 0 ? (
                <EmptyRow colSpan={6} message="No orders yet." />
              ) : null}
            </tbody>
          </table>
        </TableCard>
      ) : null}

      {activeTab === 'credits' ? (
        <TableCard footer={<span>{billing.credits.length} credit entries</span>} title="Credits">
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Customer</th>
                <th className={thClass}>Description</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Recorded</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {billing.credits.map((credit) => (
                <tr className={rowClass} key={credit.id}>
                  <td className={cellClass}>{ownerCell(credit.userId)}</td>
                  <td
                    className={`${cellClass} max-w-[300px] truncate`}
                    title={credit.description}
                  >
                    {credit.description}
                  </td>
                  <td
                    className={`${cellClass} font-semibold ${
                      credit.amountNgn < 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(credit.amountNgn)}
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {formatDateLabel(credit.createdAt)}
                  </td>
                </tr>
              ))}
              {billing.credits.length === 0 ? (
                <EmptyRow colSpan={4} message="No credits issued yet." />
              ) : null}
            </tbody>
          </table>
        </TableCard>
      ) : null}

      {/* Create invoice dialog */}
      <Dialog onOpenChange={setInvoiceDialogOpen} open={invoiceDialogOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Create invoice</DialogTitle>
            <DialogDescription>
              The invoice appears as unpaid on the customer's billing page, payable through
              Paystack like any other invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={fieldLabelClass} htmlFor="invoice-user">
                Customer
              </label>
              <select
                className={fieldInputClass}
                id="invoice-user"
                onChange={(event) =>
                  setInvoiceForm((prev) => ({ ...prev, userId: event.target.value }))
                }
                value={invoiceForm.userId}
              >
                <option value="">Select a customer…</option>
                {profiles.map((profile) => (
                  <option key={profile.userId} value={profile.userId}>
                    {profile.displayName || profile.accountId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="invoice-description">
                Description
              </label>
              <input
                className={fieldInputClass}
                id="invoice-description"
                onChange={(event) =>
                  setInvoiceForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="e.g. Managed WordPress Pro — Annual"
                type="text"
                value={invoiceForm.description}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass} htmlFor="invoice-total">
                  Total (NGN)
                </label>
                <input
                  className={fieldInputClass}
                  id="invoice-total"
                  min={0}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({ ...prev, totalNgn: event.target.value }))
                  }
                  placeholder="145000"
                  type="number"
                  value={invoiceForm.totalNgn}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="invoice-due">
                  Due date
                </label>
                <input
                  className={fieldInputClass}
                  id="invoice-due"
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                  type="date"
                  value={invoiceForm.dueDate}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              className={secondaryButtonClass}
              onClick={() => setInvoiceDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={busyId === 'create-invoice'}
              onClick={() => void handleCreateInvoice()}
            >
              {busyId === 'create-invoice' ? 'Creating…' : 'Create invoice'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
