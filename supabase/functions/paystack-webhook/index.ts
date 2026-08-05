// POST /functions/v1/paystack-webhook
//
// Paystack calls this endpoint directly. It intentionally does not use a
// Supabase user JWT; authenticity is established by validating the HMAC-SHA512
// signature over the exact request body before any event data is trusted.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { generateLicenseKey } from '../_shared/license.ts'

const MAX_EVENT_BYTES = 1_000_000
const REFERENCE_PATTERN = /^MH-[A-Za-z0-9.=-]{10,160}$/

interface PaymentIntent {
  reference: string
  user_id: string
  purpose: 'invoice' | 'plugin'
  target_id: string
  amount_ngn: number
  status: 'pending' | 'settled' | 'failed'
}

interface PaystackEvent {
  event?: string
  data?: {
    status?: string
    amount?: number
    currency?: string
    reference?: string
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

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseMetadata(value: Record<string, unknown> | string | undefined) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

async function validSignature(rawBody: string, suppliedSignature: string): Promise<boolean> {
  if (!/^[a-f0-9]{128}$/i.test(suppliedSignature)) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(requireEnv('PAYSTACK_SECRET_KEY')),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)),
  )
  const expected = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')

  let difference = expected.length ^ suppliedSignature.length
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ (suppliedSignature.charCodeAt(index) || 0)
  }
  return difference === 0
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ received: false }, 405)

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_EVENT_BYTES) {
    return response({ received: false }, 413)
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_EVENT_BYTES) {
    return response({ received: false }, 413)
  }

  const suppliedSignature = request.headers.get('x-paystack-signature') ?? ''
  try {
    if (!(await validSignature(rawBody, suppliedSignature))) {
      return response({ received: false }, 401)
    }
  } catch (error) {
    console.error('Paystack webhook signature setup failed:', error)
    return response({ received: false }, 500)
  }

  let payload: PaystackEvent
  try {
    payload = JSON.parse(rawBody) as PaystackEvent
  } catch {
    return response({ received: false }, 400)
  }

  if (payload.event !== 'charge.success' || payload.data?.status !== 'success') {
    return response({ received: true, ignored: true })
  }

  const transaction = payload.data
  const reference = transaction.reference ?? ''
  if (!REFERENCE_PATTERN.test(reference)) {
    return response({ received: true, ignored: true })
  }

  const admin = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: intent, error: intentError } = await admin
    .from('payment_intents')
    .select('reference, user_id, purpose, target_id, amount_ngn, status')
    .eq('reference', reference)
    .maybeSingle()
  if (intentError) {
    console.error('Paystack webhook intent lookup failed:', intentError)
    return response({ received: false }, 500)
  }
  if (!intent || (intent as PaymentIntent).status === 'failed') {
    return response({ received: true, ignored: true })
  }

  const typedIntent = intent as PaymentIntent
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(
    typedIntent.user_id,
  )
  if (userError || !userResult.user?.email) {
    console.error('Paystack webhook account lookup failed:', userError)
    return response({ received: false }, 500)
  }

  const metadata = parseMetadata(transaction.metadata)
  const paidEmail = transaction.customer?.email?.trim().toLowerCase() ?? ''
  const expectedEmail = userResult.user.email.trim().toLowerCase()
  const detailsMatch =
    transaction.amount === Math.round(Number(typedIntent.amount_ngn) * 100) &&
    transaction.currency === 'NGN' &&
    paidEmail === expectedEmail &&
    metadata?.maxmarkPurpose === typedIntent.purpose &&
    metadata?.maxmarkTargetId === typedIntent.target_id &&
    metadata?.maxmarkUserId === typedIntent.user_id

  if (!detailsMatch) {
    console.error('Signed Paystack event did not match its stored payment intent')
    return response({ received: true, ignored: true })
  }

  const methodLabel = transaction.authorization?.card_type
    ? `Paystack - ${transaction.authorization.card_type} ****${transaction.authorization.last4 ?? ''}`
    : `Paystack - ${transaction.channel ?? 'card'}`
  const licenseKey = typedIntent.purpose === 'plugin'
    ? generateLicenseKey(`item-${typedIntent.target_id.slice(0, 8)}`)
    : null
  const { error: settlementError } = await admin.rpc('settle_payment_intent', {
    target_user_id: typedIntent.user_id,
    payment_reference: reference,
    payment_method: methodLabel,
    purchase_license_key: licenseKey,
  })
  if (settlementError) {
    console.error('Paystack webhook settlement failed:', settlementError)
    return response({ received: false }, 500)
  }

  return response({ received: true })
})
