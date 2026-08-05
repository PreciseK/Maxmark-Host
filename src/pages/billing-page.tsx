import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, MoreVertical, CreditCard, Plus, Trash2 } from 'lucide-react'
import { fetchBillingData } from '@/lib/db/billing'
import type { BillingData, Invoice, Payment, PaymentMethod, Order, Credit } from '@/lib/db/billing'
import { verifyInvoicePayment } from '@/lib/functions'
import { paymentReferenceFromSearch } from '@/lib/paystack'
import { isDemoMode, supabase } from '@/lib/supabase'
import { PaystackCheckout } from '@/components/paystack-checkout'

const fmt = new Intl.DateTimeFormat('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtDate = (iso: string) => fmt.format(new Date(iso))
const fmtNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const MOCK_INVOICES: Invoice[] = [
  { id: 'inv-1',  subscriptionId: '#2756134', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'unpaid', dueDate: '2026-03-15', totalNgn: 313434, createdAt: '' },
  { id: 'inv-2',  subscriptionId: '#2750159', description: 'Domain Registration - .co.za: completeproperty.co.za',                        status: 'unpaid', dueDate: '2026-03-08', totalNgn: 42075,  createdAt: '' },
  { id: 'inv-3',  subscriptionId: '#2490186', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2025-03-14', totalNgn: 313434, createdAt: '' },
  { id: 'inv-4',  subscriptionId: '#2484884', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'denied', dueDate: '2025-03-14', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-5',  subscriptionId: '#2480344', description: 'Domain Registration - .co.za: completeproperty.co.za',                        status: 'paid',   dueDate: '2025-03-08', totalNgn: 42075,  createdAt: '' },
  { id: 'inv-6',  subscriptionId: '#2467700', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2025-07-29', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-7',  subscriptionId: '#2438881', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2025-07-29', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-8',  subscriptionId: '#2415682', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-12-14', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-9',  subscriptionId: '#2392639', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-11-14', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-10', subscriptionId: '#2389281', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-10-14', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-11', subscriptionId: '#2345833', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-10-14', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-12', subscriptionId: '#2321940', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-08-24', totalNgn: 31350,  createdAt: '' },
  { id: 'inv-13', subscriptionId: '#2297427', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-07-14', totalNgn: 7837,   createdAt: '' },
  { id: 'inv-14', subscriptionId: '#2273011', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-06-14', totalNgn: 7837,   createdAt: '' },
  { id: 'inv-15', subscriptionId: '#2247140', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-05-14', totalNgn: 7837,   createdAt: '' },
  { id: 'inv-16', subscriptionId: '#2221835', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-04-14', totalNgn: 7837,   createdAt: '' },
  { id: 'inv-17', subscriptionId: '#2202933', description: 'maxmarkagency@gmail.com - #2202933',                                          status: 'paid',   dueDate: '2024-03-08', totalNgn: 0,      createdAt: '' },
  { id: 'inv-18', subscriptionId: '#2195390', description: 'VIP - WordPress VIP Plan - 84dba1eae1.nxcli.io - 165.84.219.136 - clou...', status: 'paid',   dueDate: '2024-03-14', totalNgn: 7837,   createdAt: '' },
  { id: 'inv-19', subscriptionId: '#2181781', description: 'VIP WordPress',                                                               status: 'paid',   dueDate: '2024-02-14', totalNgn: 7837,   createdAt: '' },
]

const MOCK_PAYMENTS: Payment[] = [
  { id: 'p-1', transactionId: 'TXN-874215', invoiceId: null, paymentMethodLabel: 'Paystack · Visa ****4111', amountNgn: 313434, status: 'successful', paidAt: '2025-03-14T00:00:00Z' },
  { id: 'p-2', transactionId: 'TXN-872241', invoiceId: null, paymentMethodLabel: 'Paystack · Visa ****4111', amountNgn: 42075,  status: 'successful', paidAt: '2025-03-08T00:00:00Z' },
]

const MOCK_METHODS: PaymentMethod[] = [
  { id: 'pm-1', label: 'Visa ending in 4111', lastFour: '4111', cardBrand: 'visa', expiresAt: '12/2028', isDefault: true },
]

const MOCK_ORDERS: Order[] = [
  { id: 'o-1', orderRef: 'ORD-984210', product: 'WordPress VIP Plan - completeproperty.co.za',  totalLabel: '₦313,434 / yr', status: 'active', orderedAt: '2026-03-01T00:00:00Z' },
  { id: 'o-2', orderRef: 'ORD-975019', product: 'Domain Registration - completeproperty.co.za', totalLabel: '₦42,075 / yr',  status: 'active', orderedAt: '2026-03-01T00:00:00Z' },
]

const MOCK_CREDITS: Credit[] = []

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const processedPaymentRef = useRef<string | null>(null)
  const activeTab = searchParams.get('tab') || 'invoices'

  const [billing, setBilling] = useState<BillingData>({
    invoices: isDemoMode ? MOCK_INVOICES : [],
    payments: isDemoMode ? MOCK_PAYMENTS : [],
    paymentMethods: isDemoMode ? MOCK_METHODS : [],
    orders: isDemoMode ? MOCK_ORDERS : [],
    credits: isDemoMode ? MOCK_CREDITS : [],
    creditBalance: 0,
  })
  const [payFeedback, setPayFeedback] = useState<{
    tone: 'success' | 'warning'
    text: string
  } | null>(null)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const paymentReference = paymentReferenceFromSearch(searchParams)
      const loadBilling = async () => {
        if (paymentReference && processedPaymentRef.current !== paymentReference) {
          processedPaymentRef.current = paymentReference
          setPayFeedback({ tone: 'warning', text: 'Confirming your payment…' })
          await verifyInvoicePayment(sb, paymentReference)
        }
        setBilling(await fetchBillingData(sb))
        if (paymentReference) {
          setPayFeedback({ tone: 'success', text: 'Payment confirmed and recorded.' })
          const next = new URLSearchParams(searchParams)
          next.delete('payment_return')
          next.delete('reference')
          next.delete('trxref')
          setSearchParams(next, { replace: true })
        }
      }
      void loadBilling().catch((error: unknown) => {
        console.error('Billing data or payment verification failed:', error)
        setBilling({ invoices: [], payments: [], paymentMethods: [], orders: [], credits: [], creditBalance: 0 })
        setPayFeedback({
          tone: 'warning',
          text:
            error instanceof Error
              ? error.message
              : 'Billing data could not be loaded. Please retry.',
        })
      })
    })
  }, [searchParams, setSearchParams])

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
        </div>
      )}

      {/* ── Credits ── */}
      {activeTab === 'credits' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Credits</h1>
          <div className="bg-[#161619] border border-[#232328] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Credit Summary</h3>
            <div className="text-2xl font-bold text-[#5c4df0]">{fmtNgn(creditBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Available credit balance on your hosting profile.</p>
          </div>
          <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232328] bg-[#161619]">
              <h3 className="text-sm font-semibold text-white">Credit Transactions</h3>
            </div>
            {credits.length === 0 ? (
              <div className="border border-dashed border-[#232328] rounded-lg m-5 p-10 flex flex-col items-center justify-center text-center space-y-3 bg-[#121214]">
                <p className="text-muted-foreground text-xs">No credit transactions found.</p>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* ── Payments ── */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-white">Payments History</h1>
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
              {paymentMethods.length === 0 ? (
                <p className="text-xs text-muted-foreground">No payment methods saved.</p>
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
                  <span className="text-white font-medium">gloria.belleboa@gmail.com</span>
                </div>
                <div className="flex justify-between border-b border-[#232328]/30 pb-2">
                  <span className="text-muted-foreground">Account ID</span>
                  <span className="text-white font-mono font-medium">144075</span>
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
        </div>
      )}
    </div>
  )
}
