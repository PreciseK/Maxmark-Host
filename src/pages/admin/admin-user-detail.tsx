import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronLeft, Coins } from 'lucide-react'

import {
  mockAdminBilling,
  mockAdminPlans,
  mockAdminPurchases,
  mockAdminSites,
  mockAdminUsers,
} from '@/data/mockAdmin'
import {
  fetchAdminUserDetail,
  type AdminCredit,
  type AdminInvoice,
  type AdminPlanRow,
  type AdminProfile,
  type AdminPurchaseRow,
  type AdminSiteRow,
} from '@/lib/db/admin'
import { adminAction } from '@/lib/functions'
import { useSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDateLabel } from '@/lib/utils'
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

const siteTone: Record<AdminSiteRow['status'], BadgeTone> = {
  active: 'green',
  provisioning: 'sky',
  suspended: 'amber',
  failed: 'red',
}

const invoiceTone: Record<AdminInvoice['status'], BadgeTone> = {
  paid: 'green',
  unpaid: 'amber',
  denied: 'red',
}

export function AdminUserDetail() {
  const { userId = '' } = useParams()
  const location = useLocation()
  const { isDemo } = useSession()
  const stateEmail = (location.state as { email?: string } | null)?.email

  const mockUser = mockAdminUsers.find((u) => u.userId === userId)

  const [profile, setProfile] = useState<AdminProfile | null>(isDemo ? mockUser ?? null : null)
  const [sites, setSites] = useState<AdminSiteRow[]>(
    isDemo ? mockAdminSites.filter((s) => s.userId === userId) : [],
  )
  const [plans, setPlans] = useState<AdminPlanRow[]>(
    isDemo ? mockAdminPlans.filter((p) => p.userId === userId) : [],
  )
  const [invoices, setInvoices] = useState<AdminInvoice[]>(
    isDemo ? mockAdminBilling.invoices.filter((i) => i.userId === userId) : [],
  )
  const [credits, setCredits] = useState<AdminCredit[]>(
    isDemo ? mockAdminBilling.credits.filter((c) => c.userId === userId) : [],
  )
  const [purchases, setPurchases] = useState<AdminPurchaseRow[]>(
    isDemo ? mockAdminPurchases.filter((p) => p.userId === userId) : [],
  )

  const [creditDialogOpen, setCreditDialogOpen] = useState(false)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditDescription, setCreditDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'demo' | 'error' | 'ok'; text?: string } | null>(
    null,
  )

  useEffect(() => {
    if (!supabase || !userId) return
    const sb = supabase

    async function loadLiveData() {
      try {
        const detail = await fetchAdminUserDetail(sb, userId)
        if (detail.profile) setProfile(detail.profile)
        setSites(detail.sites)
        setPlans(detail.plans)
        setInvoices(detail.invoices)
        setCredits(detail.credits)
        setPurchases(detail.purchases)
      } catch (error) {
        console.warn('Admin user detail fetch failed, keeping demo data:', error)
      }
    }

    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) void loadLiveData()
    })
  }, [userId])

  const creditBalance = useMemo(
    () => credits.reduce((sum, c) => sum + c.amountNgn, 0),
    [credits],
  )

  const email = stateEmail || (isDemo ? mockUser?.email : '') || ''
  const title = profile?.displayName || email || 'Customer'

  async function handleSiteStatusToggle(site: AdminSiteRow) {
    const nextStatus = site.status === 'suspended' ? 'active' : 'suspended'

    if (isDemo || !supabase) {
      setSites((prev) =>
        prev.map((s) => (s.id === site.id ? { ...s, status: nextStatus } : s)),
      )
      setFeedback({ kind: 'demo' })
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      await adminAction(supabase, {
        action: 'set_site_status',
        siteId: site.id,
        status: nextStatus,
      })
      setSites((prev) =>
        prev.map((s) => (s.id === site.id ? { ...s, status: nextStatus } : s)),
      )
      setFeedback({ kind: 'ok', text: `${site.siteDomain} is now ${nextStatus}.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Site update failed',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleCreditSubmit() {
    const amount = Number(creditAmount)
    if (!Number.isFinite(amount) || amount === 0 || !creditDescription.trim()) {
      setFeedback({ kind: 'error', text: 'Enter a non-zero amount and a description.' })
      return
    }

    const closeAndReset = () => {
      setCreditDialogOpen(false)
      setCreditAmount('')
      setCreditDescription('')
    }

    if (isDemo || !supabase) {
      setCredits((prev) => [
        {
          id: `demo-credit-${Date.now()}`,
          userId,
          amountNgn: amount,
          description: creditDescription.trim(),
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
      closeAndReset()
      setFeedback({ kind: 'demo' })
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      const { credit } = await adminAction<{ credit: Record<string, unknown> }>(supabase, {
        action: 'adjust_credit',
        userId,
        amountNgn: amount,
        description: creditDescription.trim(),
      })
      setCredits((prev) => [
        {
          id: credit.id as string,
          userId,
          amountNgn: Number(credit.amount_ngn),
          description: credit.description as string,
          createdAt: credit.created_at as string,
        },
        ...prev,
      ])
      closeAndReset()
      setFeedback({ kind: 'ok', text: `Credit of ${formatCurrency(amount)} recorded.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Credit adjustment failed',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition inline-flex items-center gap-1" to="/admin/users">
          <ChevronLeft className="h-3 w-3" />
          Users
        </Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white">{title}</span>
      </div>

      <AdminPageHeader
        actions={
          <button className={primaryButtonClass} onClick={() => setCreditDialogOpen(true)}>
            <Coins className="h-4 w-4" />
            Adjust credit
          </button>
        }
        description={email || 'Customer account detail'}
        title={title}
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

      {/* Profile summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#161618] border border-[#232328] rounded-lg p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Account ID
          </p>
          <p className="text-sm font-mono text-white mt-1">{profile?.accountId ?? '—'}</p>
        </div>
        <div className="bg-[#161618] border border-[#232328] rounded-lg p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Support PIN
          </p>
          <p className="text-sm font-mono text-white mt-1">{profile?.supportPin ?? '—'}</p>
        </div>
        <div className="bg-[#161618] border border-[#232328] rounded-lg p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Credit balance
          </p>
          <p className="text-sm font-semibold text-white mt-1">
            {formatCurrency(creditBalance)}
          </p>
        </div>
        <div className="bg-[#161618] border border-[#232328] rounded-lg p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Customer since
          </p>
          <p className="text-sm text-white mt-1">
            {profile ? formatDateLabel(profile.createdAt) : '—'}
          </p>
        </div>
      </div>

      {/* Sites */}
      <TableCard title={`Sites (${sites.length})`}>
        <table className={tableClass}>
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>Domain</th>
              <th className={thClass}>Plan</th>
              <th className={thClass}>Region</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Created</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {sites.map((site) => (
              <tr className={rowClass} key={site.id}>
                <td className={`${cellClass} font-semibold`}>{site.siteDomain}</td>
                <td className={`${cellClass} text-muted-foreground`}>{site.plan}</td>
                <td className={`${cellClass} text-muted-foreground`}>{site.region}</td>
                <td className={cellClass}>
                  <StatusBadge tone={siteTone[site.status]}>{site.status}</StatusBadge>
                </td>
                <td className={`${cellClass} text-muted-foreground`}>
                  {formatDateLabel(site.createdAt)}
                </td>
                <td className={cellClass}>
                  {site.status === 'active' || site.status === 'suspended' ? (
                    <button
                      className="text-[#5c4df0] hover:text-[#796ef3] font-semibold disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void handleSiteStatusToggle(site)}
                    >
                      {site.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {sites.length === 0 ? (
              <EmptyRow colSpan={6} message="No sites provisioned for this account." />
            ) : null}
          </tbody>
        </table>
      </TableCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Plans */}
        <TableCard title={`Hosting plans (${plans.length})`}>
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Plan</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Renews</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {plans.map((plan) => (
                <tr className={rowClass} key={plan.id}>
                  <td className={`${cellClass} font-semibold`}>{plan.name}</td>
                  <td className={cellClass}>
                    <StatusBadge tone="violet">{plan.type}</StatusBadge>
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>{plan.renewalDate}</td>
                  <td className={cellClass}>
                    <StatusBadge tone={plan.status === 'active' ? 'green' : 'zinc'}>
                      {plan.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
              {plans.length === 0 ? (
                <EmptyRow colSpan={4} message="No hosting plans." />
              ) : null}
            </tbody>
          </table>
        </TableCard>

        {/* Invoices */}
        <TableCard title={`Invoices (${invoices.length})`}>
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Description</th>
                <th className={thClass}>Due</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {invoices.map((invoice) => (
                <tr className={rowClass} key={invoice.id}>
                  <td className={`${cellClass} max-w-[220px] truncate`} title={invoice.description}>
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
                </tr>
              ))}
              {invoices.length === 0 ? <EmptyRow colSpan={4} message="No invoices." /> : null}
            </tbody>
          </table>
        </TableCard>

        {/* Credits */}
        <TableCard title={`Credits (${credits.length})`}>
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Description</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Recorded</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {credits.map((credit) => (
                <tr className={rowClass} key={credit.id}>
                  <td className={`${cellClass} max-w-[220px] truncate`} title={credit.description}>
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
              {credits.length === 0 ? <EmptyRow colSpan={3} message="No credits." /> : null}
            </tbody>
          </table>
        </TableCard>

        {/* Marketplace licenses */}
        <TableCard title={`Marketplace licenses (${purchases.length})`}>
          <table className={tableClass}>
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>Item</th>
                <th className={thClass}>License</th>
                <th className={thClass}>Paid</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {purchases.map((purchase) => (
                <tr className={rowClass} key={purchase.id}>
                  <td className={`${cellClass} font-semibold`}>{purchase.pluginName}</td>
                  <td className={`${cellClass} text-muted-foreground font-mono text-[10px]`}>
                    {purchase.licenseKey}
                  </td>
                  <td className={`${cellClass} text-muted-foreground`}>
                    {formatCurrency(purchase.amountPaidNgn)}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge
                      tone={
                        purchase.status === 'active'
                          ? 'green'
                          : purchase.status === 'revoked'
                            ? 'red'
                            : 'zinc'
                      }
                    >
                      {purchase.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 ? (
                <EmptyRow colSpan={4} message="No marketplace licenses." />
              ) : null}
            </tbody>
          </table>
        </TableCard>
      </div>

      {/* Adjust credit dialog */}
      <Dialog onOpenChange={setCreditDialogOpen} open={creditDialogOpen}>
        <DialogContent className={adminDialogClass}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Adjust credit</DialogTitle>
            <DialogDescription>
              Positive amounts add account credit; negative amounts deduct it. The entry is
              visible to the customer on their billing page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={fieldLabelClass} htmlFor="credit-amount">
                Amount (NGN)
              </label>
              <input
                className={fieldInputClass}
                id="credit-amount"
                onChange={(event) => setCreditAmount(event.target.value)}
                placeholder="e.g. 25000 or -5000"
                type="number"
                value={creditAmount}
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="credit-description">
                Description
              </label>
              <input
                className={fieldInputClass}
                id="credit-description"
                onChange={(event) => setCreditDescription(event.target.value)}
                placeholder="Reason shown to the customer"
                type="text"
                value={creditDescription}
              />
            </div>
          </div>
          <DialogFooter>
            <button
              className={secondaryButtonClass}
              onClick={() => setCreditDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className={primaryButtonClass}
              disabled={busy}
              onClick={() => void handleCreditSubmit()}
            >
              {busy ? 'Saving…' : 'Record credit'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
