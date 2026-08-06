import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, MoreVertical, CreditCard, Plus, Trash2, Receipt, CreditCard as CreditIcon, ShoppingCart, History } from 'lucide-react'
import { fetchBillingData, type BillingData, type PaymentMethod } from '@/lib/db/billing'
import { verifyInvoicePayment } from '@/lib/functions'
import { paymentReferenceFromSearch } from '@/lib/paystack'
import { useSession } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'
import { PaystackCheckout } from '@/components/paystack-checkout'
import { EmptyState, ErrorState, TableSkeleton, StatsSkeleton } from '@/components/ui/ui-states'

const fmt = new Intl.DateTimeFormat('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtDate = (iso: string) => fmt.format(new Date(iso))
const fmtNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function BillingPage() {
  const { session, accountId } = useSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const processedPaymentRef = useRef<string | null>(null)
  const activeTab = searchParams.get('tab') || 'invoices'

  const [billing, setBilling] = useState<BillingData>({
    invoices: [],
    payments: [],
    paymentMethods: [],
    orders: [],
    credits: [],
    creditBalance: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payFeedback, setPayFeedback] = useState<{
    tone: 'success' | 'warning'
    text: string
  } | null>(null)

  const loadBillingData = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const sb = supabase
    setLoading(true)
    setError(null)
    try {
      const { data: { session: activeSession } } = await sb.auth.getSession()
      if (!activeSession) {
        setLoading(false)
        return
      }
      const paymentReference = paymentReferenceFromSearch(searchParams)
      if (paymentReference && processedPaymentRef.current !== paymentReference) {
        processedPaymentRef.current = paymentReference
        setPayFeedback({ tone: 'warning', text: 'Confirming your payment…' })
        await verifyInvoicePayment(sb, paymentReference)
      }

      const data = await fetchBillingData(sb)
      setBilling(data)

      if (paymentReference) {
        setPayFeedback({ tone: 'success', text: 'Payment confirmed and recorded.' })
        const next = new URLSearchParams(searchParams)
        next.delete('payment_return')
        next.delete('reference')
        next.delete('trxref')
        setSearchParams(next, { replace: true })
      }
    } catch (err) {
      console.error('Billing data or payment verification failed:', err)
      setError(err instanceof Error ? err.message : 'Billing data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBillingData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const { invoices, payments, paymentMethods, orders, credits, creditBalance } = billing

  return (
    <div className="space-y-6 text-left">
      {/* Breadcrumbs */}
      <div className="text-xs text-muted-foreground">
        <Link className="hover:text-white transition" to="/home">Home</Link>{' '}
        <span className="mx-1 text-[#4f4f52]">/</span>{' '}
        <span className="text-white capitalize">
          {activeTab === 'payment-info' ? 'Payment Info' : activeTab}
        </span>
      </div>

      {error ? (
        <ErrorState
          title="Billing Error"
          message="Could not load your billing account information."
          error={error}
          onRetry={() => void loadBillingData()}
        />
      ) : null}

      {/* ── Invoices ── */}
      {activeTab === 'invoices' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          {payFeedback && (
            <div
              className={`rounded-md border px-4 py-3 text-xs font-medium ${
                payFeedback.tone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              }`}
            >
              {payFeedback.text}
            </div>
          )}

          {loading ? (
            <TableSkeleton rows={4} />
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-7 w-7 text-violet-400" />}
              title="No Invoices Issued"
              description="You currently have no billing invoices or unpaid statements."
            />
          ) : (
            <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
                <h3 className="text-sm font-semibold text-white">Invoices</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                      <th className="px-5 py-3 font-semibold w-2/3">Description</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">
                        <button className="flex items-center gap-1.5 hover:text-white transition">
                          Due Date <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-5 py-3 font-semibold">Total</th>
                      <th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-xs text-white">
                    {invoices.map((inv) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={inv.id}>
                        <td className="px-5 py-4 space-y-1">
                          <div className="text-white hover:text-[#5c4df0] cursor-pointer font-medium leading-relaxed">
                            {inv.description}
                          </div>
                          {inv.subscriptionId && (
                            <div className="text-muted-foreground text-[10px] font-semibold">{inv.subscriptionId}</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {inv.status === 'unpaid' && (
                            <span className="inline-flex border border-amber-500/30 bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full text-[10px] font-semibold">Unpaid</span>
                          )}
                          {inv.status === 'paid' && (
                            <span className="inline-flex border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">Paid</span>
                          )}
                          {inv.status === 'denied' && (
                            <span className="inline-flex border border-white/20 bg-white/5 text-white/70 px-2 py-0.5 rounded-full text-[10px] font-semibold">Denied</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{fmtDate(inv.dueDate)}</td>
                        <td className="px-5 py-4 font-semibold">{fmtNgn(inv.totalNgn)}</td>
                        <td className="px-5 py-4">
                          {inv.status === 'unpaid' && inv.totalNgn > 0 ? (
                            <PaystackCheckout
                              payment={{ purpose: 'invoice', invoiceId: inv.id }}
                              onError={(message) =>
                                setPayFeedback({ tone: 'warning', text: message })
                              }
                            />
                          ) : (
                            <button className="text-muted-foreground hover:text-white transition">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 border-t border-[#232328] flex items-center justify-end gap-2 text-[10px] font-bold text-muted-foreground">
                <span>List Size</span>
                <select className="bg-[#121214] border border-[#2d2d34] text-white px-2.5 py-1 rounded focus:outline-none cursor-pointer">
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Credits ── */}
      {activeTab === 'credits' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Credits</h1>
          {loading ? (
            <StatsSkeleton count={1} />
          ) : (
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5">
              <h3 className="text-sm font-semibold text-white mb-2">Credit Summary</h3>
              <div className="text-2xl font-bold text-[#5c4df0]">{fmtNgn(creditBalance)}</div>
              <p className="text-xs text-muted-foreground mt-1">Available credit balance on your hosting profile.</p>
            </div>
          )}

          {loading ? (
            <TableSkeleton rows={3} />
          ) : credits.length === 0 ? (
            <EmptyState
              icon={<CreditIcon className="h-7 w-7 text-violet-400" />}
              title="No Credit Transactions"
              description="Your account currently has no credit adjustment history."
            />
          ) : (
            <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
                <h3 className="text-sm font-semibold text-white">Credit Transactions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                      <th className="px-5 py-3 font-semibold">Description</th>
                      <th className="px-5 py-3 font-semibold">Amount</th>
                      <th className="px-5 py-3 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-xs text-white">
                    {credits.map((cr) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={cr.id}>
                        <td className="px-5 py-4">{cr.description}</td>
                        <td className="px-5 py-4 font-semibold">{fmtNgn(cr.amountNgn)}</td>
                        <td className="px-5 py-4 text-muted-foreground">{fmtDate(cr.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Payments ── */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Payments History</h1>
          {loading ? (
            <TableSkeleton rows={4} />
          ) : payments.length === 0 ? (
            <EmptyState
              icon={<History className="h-7 w-7 text-violet-400" />}
              title="No Payment Records"
              description="No completed payment transactions have been logged for this account."
            />
          ) : (
            <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
                <h3 className="text-sm font-semibold text-white">Payments</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                      <th className="px-5 py-3 font-semibold">Transaction ID</th>
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 font-semibold">Invoice</th>
                      <th className="px-5 py-3 font-semibold">Payment Method</th>
                      <th className="px-5 py-3 font-semibold">Amount</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-xs text-white">
                    {payments.map((pay) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={pay.id}>
                        <td className="px-5 py-4 font-mono font-medium text-white">{pay.transactionId}</td>
                        <td className="px-5 py-4 text-muted-foreground">{fmtDate(pay.paidAt)}</td>
                        <td className="px-5 py-4 font-medium underline cursor-pointer text-white">{pay.invoiceId ?? '—'}</td>
                        <td className="px-5 py-4 text-muted-foreground">{pay.paymentMethodLabel}</td>
                        <td className="px-5 py-4 font-semibold text-white">{fmtNgn(pay.amountNgn)}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            {capitalize(pay.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button className="text-muted-foreground hover:text-white transition">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Payment Info ── */}
      {activeTab === 'payment-info' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Payment Information</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Saved payment methods */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#232328] pb-3">
                <h3 className="text-sm font-semibold text-white">Saved Payment Methods</h3>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#202024] hover:bg-[#2c2c32] rounded border border-[#2d2d34] text-white transition text-[10px] font-bold">
                  <Plus className="h-3 w-3" />
                  Add Method
                </button>
              </div>
              {loading ? (
                <TableSkeleton rows={2} />
              ) : paymentMethods.length === 0 ? (
                <EmptyState
                  icon={<CreditCard className="h-6 w-6 text-violet-400" />}
                  title="No Saved Payment Methods"
                  description="Add a debit or credit card for automatic plan renewals."
                  actionLabel="Add Method"
                />
              ) : (
                paymentMethods.map((pm: PaymentMethod) => (
                  <div className="flex items-center justify-between bg-[#121214] border border-[#232328] rounded-lg p-4" key={pm.id}>
                    <div className="flex items-center gap-3.5">
                      <div className="p-2 bg-[#1c1c1f] rounded border border-[#2d2d34] text-white shrink-0">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="font-semibold text-white">{pm.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Expires {pm.expiresAt}
                          {pm.isDefault && <> · <span className="text-emerald-400 font-bold uppercase">Default</span></>}
                        </div>
                      </div>
                    </div>
                    <button className="p-1.5 bg-[#202024] hover:bg-red-500/10 rounded border border-[#2d2d34] hover:border-red-500/30 text-muted-foreground hover:text-red-400 transition">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Billing profile */}
            <div className="bg-[#161619] border border-[#232328] rounded-lg p-5 space-y-4">
              <div className="border-b border-[#232328] pb-3">
                <h3 className="text-sm font-semibold text-white">Billing Profile Details</h3>
              </div>
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between border-b border-[#232328]/30 pb-2">
                  <span className="text-muted-foreground">Contact Email</span>
                  <span className="text-white font-medium">{session?.user.email ?? '—'}</span>
                </div>
                <div className="flex justify-between border-b border-[#232328]/30 pb-2">
                  <span className="text-muted-foreground">Account ID</span>
                  <span className="text-white font-mono font-medium">{accountId ?? '—'}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-muted-foreground">Support PIN</span>
                  <span className="text-white font-mono font-medium">••••••</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Orders ── */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Order History</h1>
          {loading ? (
            <TableSkeleton rows={3} />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-7 w-7 text-violet-400" />}
              title="No Orders Found"
              description="No subscription or marketplace orders have been placed yet."
            />
          ) : (
            <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
                <h3 className="text-sm font-semibold text-white">Orders</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]">
                      <th className="px-5 py-3 font-semibold">Order ID</th>
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 font-semibold">Product</th>
                      <th className="px-5 py-3 font-semibold">Total</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232328] text-xs text-white">
                    {orders.map((ord) => (
                      <tr className="hover:bg-[#1c1c20] transition" key={ord.id}>
                        <td className="px-5 py-4 font-mono font-medium text-white">{ord.orderRef}</td>
                        <td className="px-5 py-4 text-muted-foreground">{fmtDate(ord.orderedAt)}</td>
                        <td className="px-5 py-4 text-white font-medium">{ord.product}</td>
                        <td className="px-5 py-4 font-semibold text-white">{ord.totalLabel}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                            {capitalize(ord.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button className="text-muted-foreground hover:text-white transition">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
