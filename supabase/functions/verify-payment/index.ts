// POST /functions/v1/verify-payment
// Body: { reference }
//
// The reference must belong to a server-created payment_intent for the
// authenticated user. Canonical target and price data are never accepted from
// the browser. Settlement is performed by one row-locking database function so
// a Paystack reference can deliver value exactly once.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { generateLicenseKey } from '../_shared/license.ts'

const bodySchema = z.object({
  reference: z.string().regex(/^MH-[A-Za-z0-9.=-]{10,160}$/),
})

interface PaymentIntent {
  reference: string
  user_id: string
  purpose: 'invoice' | 'plugin'
  target_id: string
  amount_ngn: number
  status: 'pending' | 'settled' | 'failed'
}

interface PaystackVerification {
  status: boolean
  data?: {
    status: string
    amount: number
    currency: string
    reference: string
    channel?: string
    metadata?: Record<string, unknown> | string
    customer?: { email?: string }
    authorization?: { card_type?: string; last4?: string }
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function parseMetadata(value: Record<string, unknown> | string | undefined) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function verifyWithPaystack(reference: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${requireEnv('PAYSTACK_SECRET_KEY')}` } },
  )
  if (!response.ok) throw new Error(`Paystack verification returned HTTP ${response.status}`)

  const payload = (await response.json()) as PaystackVerification
  if (!payload.status || !payload.data || payload.data.status !== 'success') return null
  if (payload.data.currency !== 'NGN' || payload.data.reference !== reference) return null

  return {
    amountNgn: payload.data.amount / 100,
    reference: payload.data.reference,
    email: payload.data.customer?.email?.trim().toLowerCase() ?? '',
    metadata: parseMetadata(payload.data.metadata),
    methodLabel: payload.data.authorization?.card_type
      ? `Paystack · ${payload.data.authorization.card_type} ****${payload.data.authorization.last4 ?? ''}`
      : `Paystack · ${payload.data.channel ?? 'card'}`,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405)

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return errorResponse('Missing Authorization header', 401)

  const userClient = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: authHeader } } },
  )
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()
  if (userError || !user?.email) return errorResponse('Invalid or expired session', 401)

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  const admin = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: intent, error: intentError } = await admin
    .from('payment_intents')
    .select('reference, user_id, purpose, target_id, amount_ngn, status')
    .eq('reference', body.reference)
    .eq('user_id', user.id)
    .single()
  if (intentError || !intent) return errorResponse('Payment intent not found', 404)
  if ((intent as PaymentIntent).status === 'failed') {
    return errorResponse('Payment intent is no longer valid', 409)
  }

  let paid: Awaited<ReturnType<typeof verifyWithPaystack>>
  try {
    paid = await verifyWithPaystack(body.reference)
  } catch (error) {
    console.error('paystack verify failed:', error)
    return errorResponse('Unable to reach Paystack for verification', 502)
  }
  if (!paid) return errorResponse('Transaction was not successful', 402)

  const typedIntent = intent as PaymentIntent
  const expectedEmail = user.email.trim().toLowerCase()
  const metadata = paid.metadata
  if (
    paid.amountNgn !== Number(typedIntent.amount_ngn) ||
    paid.email !== expectedEmail ||
    metadata?.maxmarkPurpose !== typedIntent.purpose ||
    metadata?.maxmarkTargetId !== typedIntent.target_id ||
    metadata?.maxmarkUserId !== user.id
  ) {
    console.error('Paystack verification did not match the stored payment intent')
    return errorResponse('Transaction details do not match this payment request', 409)
  }

  const licenseKey =
    typedIntent.purpose === 'plugin'
      ? generateLicenseKey(`item-${typedIntent.target_id.slice(0, 8)}`)
      : null
  const { data, error } = await admin.rpc('settle_payment_intent', {
    target_user_id: user.id,
    payment_reference: paid.reference,
    payment_method: paid.methodLabel,
    purchase_license_key: licenseKey,
  })
  if (error) {
    console.error('atomic payment settlement failed:', error)
    return errorResponse('Unable to settle the verified payment', 409)
  }

  return jsonResponse({ success: true, data })
})
