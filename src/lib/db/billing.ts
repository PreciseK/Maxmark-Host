import type { SupabaseClient } from '@supabase/supabase-js'

export interface Invoice {
  id: string
  subscriptionId: string | null
  description: string
  status: 'unpaid' | 'paid' | 'denied'
  dueDate: string
  totalNgn: number
  createdAt: string
}

export interface Payment {
  id: string
  transactionId: string
  invoiceId: string | null
  paymentMethodLabel: string
  amountNgn: number
  status: 'successful' | 'failed' | 'refunded'
  paidAt: string
}

export interface PaymentMethod {
  id: string
  label: string
  lastFour: string
  cardBrand: string
  expiresAt: string
  isDefault: boolean
}

export interface Order {
  id: string
  orderRef: string
  product: string
  totalLabel: string
  status: 'active' | 'cancelled' | 'expired'
  orderedAt: string
}

export interface Credit {
  id: string
  amountNgn: number
  description: string
  createdAt: string
}

export interface BillingData {
  invoices: Invoice[]
  payments: Payment[]
  paymentMethods: PaymentMethod[]
  orders: Order[]
  credits: Credit[]
  creditBalance: number
}

export async function fetchBillingData(supabase: SupabaseClient): Promise<BillingData> {
  const [invoicesRes, paymentsRes, methodsRes, ordersRes, creditsRes] = await Promise.all([
    supabase.from('invoices').select('*').order('due_date', { ascending: false }),
    supabase.from('payments').select('*').order('paid_at', { ascending: false }),
    supabase.from('payment_methods').select('*').order('is_default', { ascending: false }),
    supabase.from('orders').select('*').order('ordered_at', { ascending: false }),
    supabase.from('credits').select('*').order('created_at', { ascending: false }),
  ])

  if (invoicesRes.error) throw invoicesRes.error
  if (paymentsRes.error) throw paymentsRes.error
  if (methodsRes.error) throw methodsRes.error
  if (ordersRes.error) throw ordersRes.error
  if (creditsRes.error) throw creditsRes.error

  const credits: Credit[] = (creditsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    amountNgn: Number(r.amount_ngn),
    description: r.description as string,
    createdAt: r.created_at as string,
  }))

  const creditBalance = credits.reduce((sum, c) => sum + c.amountNgn, 0)

  return {
    invoices: (invoicesRes.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      subscriptionId: r.subscription_id as string | null,
      description: r.description as string,
      status: r.status as Invoice['status'],
      dueDate: r.due_date as string,
      totalNgn: Number(r.total_ngn),
      createdAt: r.created_at as string,
    })),
    payments: (paymentsRes.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      transactionId: r.transaction_id as string,
      invoiceId: r.invoice_id as string | null,
      paymentMethodLabel: r.payment_method_label as string,
      amountNgn: Number(r.amount_ngn),
      status: r.status as Payment['status'],
      paidAt: r.paid_at as string,
    })),
    paymentMethods: (methodsRes.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      label: r.label as string,
      lastFour: r.last_four as string,
      cardBrand: r.card_brand as string,
      expiresAt: r.expires_at as string,
      isDefault: r.is_default as boolean,
    })),
    orders: (ordersRes.data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      orderRef: r.order_ref as string,
      product: r.product as string,
      totalLabel: r.total_label as string,
      status: r.status as Order['status'],
      orderedAt: r.ordered_at as string,
    })),
    credits,
    creditBalance,
  }
}
