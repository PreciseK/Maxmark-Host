// POST /functions/v1/verify-payment
// Body: { reference, purpose: 'invoice' | 'plugin', invoiceId? , pluginId? }
//
// Server-side Paystack verification. The client NEVER decides that something
// is paid — after the Paystack popup succeeds it sends the transaction
// reference here; this function:
//   1. Resolves the caller from their JWT.
//   2. Verifies the transaction against the Paystack API with the secret key.
//   3. Checks the paid amount covers the invoice total / plugin price.
//   4. Writes the payment / plugin purchase with the service role.
//
// Secrets (supabase secrets set): PAYSTACK_SECRET_KEY

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { generateLicenseKey } from '../_shared/license.ts'

const bodySchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('invoice'),
    reference: z.string().min(1),
    invoiceId: z.string().uuid(),
  }),
  z.object({
    purpose: z.literal('plugin'),
    reference: z.string().min(1),
    pluginId: z.string().uuid(),
  }),
])

interface PaystackVerification {
  status: boolean
  data?: {
    status: string
    amount: number // kobo
    currency: string
    reference: string
    channel?: string
    authorization?: { card_type?: string; last4?: string }
  }
}

async function verifyWithPaystack(reference: string) {
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured')
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  )

  if (!response.ok) {
    throw new Error(`Paystack verification returned HTTP ${response.status}`)
  }

  const payload = (await response.json()) as PaystackVerification

  if (!payload.status || !payload.data || payload.data.status !== 'success') {
    return null
  }

  if (payload.data.currency !== 'NGN') {
    return null
  }

  return {
    amountNgn: payload.data.amount / 100,
    reference: payload.data.reference,
    methodLabel: payload.data.authorization?.card_type
      ? `Paystack · ${payload.data.authorization.card_type} ****${payload.data.authorization.last4 ?? ''}`
      : `Paystack · ${payload.data.channel ?? 'card'}`,
  }
}

async function settleInvoice(
  admin: SupabaseClient,
  userId: string,
  invoiceId: string,
  paid: { amountNgn: number; reference: string; methodLabel: string },
) {
  const { data: invoice, error } = await admin
    .from('invoices')
    .select('id, user_id, status, total_ngn')
    .eq('id', invoiceId)
    .single()

  if (error || !invoice) return errorResponse('Invoice not found', 404)
  if (invoice.user_id !== userId) return errorResponse('Invoice not found', 404)
  if (invoice.status === 'paid') {
    return jsonResponse({ success: true, data: { alreadyPaid: true } })
  }
  if (paid.amountNgn < Number(invoice.total_ngn)) {
    return errorResponse(
      `Payment of ₦${paid.amountNgn} does not cover the invoice total`,
      402,
    )
  }

  // transaction_id is unique — a replayed reference cannot double-record.
  const { error: paymentError } = await admin.from('payments').insert({
    user_id: userId,
    invoice_id: invoiceId,
    transaction_id: paid.reference,
    payment_method_label: paid.methodLabel,
    amount_ngn: paid.amountNgn,
    status: 'successful',
  })

  if (paymentError && !paymentError.message.includes('duplicate')) {
    console.error('payment insert failed:', paymentError)
    return errorResponse('Unable to record payment', 500)
  }

  const { error: invoiceError } = await admin
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', invoiceId)

  if (invoiceError) {
    console.error('invoice update failed:', invoiceError)
    return errorResponse('Payment recorded but invoice update failed', 500)
  }

  return jsonResponse({ success: true, data: { invoiceId, status: 'paid' } })
}

async function settlePluginPurchase(
  admin: SupabaseClient,
  userId: string,
  pluginId: string,
  paid: { amountNgn: number; reference: string },
) {
  // "Subscribe first": marketplace purchases require an active hosting plan.
  // The UI gates checkout before money moves; this stops crafted calls.
  const { data: userTier, error: tierError } = await admin.rpc(
    'marketplace_tier_for_user',
    { uid: userId },
  )

  if (tierError) {
    console.error('marketplace_tier_for_user failed:', tierError)
    return errorResponse('Unable to resolve subscription tier', 500)
  }

  if (!userTier || userTier === 0) {
    return errorResponse(
      'An active hosting plan is required to buy marketplace items.',
      403,
    )
  }

  const { data: plugin, error } = await admin
    .from('marketplace_plugins')
    .select('id, slug, price_ngn, status')
    .eq('id', pluginId)
    .single()

  if (error || !plugin || plugin.status !== 'active') {
    return errorResponse('Plugin not found', 404)
  }
  if (paid.amountNgn < Number(plugin.price_ngn)) {
    return errorResponse(
      `Payment of ₦${paid.amountNgn} does not cover the plugin price`,
      402,
    )
  }

  // (user_id, plugin_id) is unique — repeat verification returns the
  // existing licence instead of creating a second one.
  const { data: existing } = await admin
    .from('plugin_purchases')
    .select('*')
    .eq('user_id', userId)
    .eq('plugin_id', pluginId)
    .maybeSingle()

  if (existing) {
    return jsonResponse({ success: true, data: { purchase: existing } })
  }

  const { data: purchase, error: purchaseError } = await admin
    .from('plugin_purchases')
    .insert({
      user_id: userId,
      plugin_id: pluginId,
      license_key: generateLicenseKey(plugin.slug),
      amount_paid_ngn: paid.amountNgn,
      acquisition: 'purchase',
      status: 'active',
    })
    .select()
    .single()

  if (purchaseError) {
    console.error('purchase insert failed:', purchaseError)
    return errorResponse('Unable to record purchase', 500)
  }

  return jsonResponse({ success: true, data: { purchase } })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('Missing Authorization header', 401)
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return errorResponse('Invalid or expired session', 401)
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  let paid: Awaited<ReturnType<typeof verifyWithPaystack>>
  try {
    paid = await verifyWithPaystack(body.reference)
  } catch (error) {
    console.error('paystack verify failed:', error)
    return errorResponse('Unable to reach Paystack for verification', 502)
  }

  if (!paid) {
    return errorResponse('Transaction was not successful', 402)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  if (body.purpose === 'invoice') {
    return settleInvoice(admin, user.id, body.invoiceId, paid)
  }

  return settlePluginPurchase(admin, user.id, body.pluginId, paid)
})
