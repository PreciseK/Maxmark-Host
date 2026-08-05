// POST /functions/v1/initialize-payment
// Body: { purpose: 'invoice', invoiceId } | { purpose: 'plugin', pluginId }
//
// Paystack transactions are initialized here, never in the browser. The
// authenticated user, canonical database price, target and reference are
// persisted as a single-use payment intent before checkout begins.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'

const bodySchema = z.discriminatedUnion('purpose', [
  z.object({ purpose: z.literal('invoice'), invoiceId: z.string().uuid() }),
  z.object({ purpose: z.literal('plugin'), pluginId: z.string().uuid() }),
])

interface PaystackInitializeResponse {
  status: boolean
  message?: string
  data?: {
    authorization_url: string
    access_code: string
    reference: string
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function applicationUrl(): URL {
  const url = new URL(requireEnv('APP_URL'))
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error('APP_URL must use HTTPS outside local development')
  }
  return url
}

async function resolveInvoice(
  admin: SupabaseClient,
  userId: string,
  invoiceId: string,
) {
  const { data, error } = await admin
    .from('invoices')
    .select('id, total_ngn, status')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('Invoice not found')
  if (data.status !== 'unpaid') throw new Error('Invoice is not payable')

  return { targetId: data.id as string, amountNgn: Number(data.total_ngn) }
}

async function resolvePlugin(
  admin: SupabaseClient,
  userId: string,
  pluginId: string,
) {
  const [{ data: plugin, error: pluginError }, { data: purchase }] = await Promise.all([
    admin
      .from('marketplace_plugins')
      .select('id, price_ngn, status, download_asset_path')
      .eq('id', pluginId)
      .single(),
    admin
      .from('plugin_purchases')
      .select('id')
      .eq('user_id', userId)
      .eq('plugin_id', pluginId)
      .maybeSingle(),
  ])

  if (pluginError || !plugin || plugin.status !== 'active') {
    throw new Error('Marketplace item not found')
  }
  if (!plugin.download_asset_path) {
    throw new Error('This marketplace item is temporarily unavailable')
  }
  if (purchase) throw new Error('This marketplace item is already owned')

  const { data: tier, error: tierError } = await admin.rpc('marketplace_tier_for_user', {
    uid: userId,
  })
  if (tierError) throw new Error('Unable to verify the hosting subscription')
  if (!tier || tier === 0) throw new Error('An active hosting plan is required')

  return { targetId: plugin.id as string, amountNgn: Number(plugin.price_ngn) }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
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
  if (userError || !user?.email) return errorResponse('Invalid account session', 401)

  let body: z.infer<typeof bodySchema>
  let pendingReference: string | null = null
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

  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count, error: countError } = await admin
      .from('payment_intents')
      .select('reference', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', tenMinutesAgo)
    if (countError) throw countError
    if ((count ?? 0) >= 10) return errorResponse('Too many payment attempts. Try again later.', 429)

    const target =
      body.purpose === 'invoice'
        ? await resolveInvoice(admin, user.id, body.invoiceId)
        : await resolvePlugin(admin, user.id, body.pluginId)

    if (!Number.isFinite(target.amountNgn) || target.amountNgn <= 0) {
      return errorResponse('The selected item has an invalid price', 409)
    }

    const paystackSecret = requireEnv('PAYSTACK_SECRET_KEY')
    const reference = `MH-${Date.now()}-${crypto.randomUUID()}`
    pendingReference = reference
    const callback = new URL(
      body.purpose === 'invoice' ? '/billing' : '/marketplace',
      applicationUrl(),
    )
    callback.searchParams.set('payment_return', '1')

    const { error: intentError } = await admin.from('payment_intents').insert({
      reference,
      user_id: user.id,
      purpose: body.purpose,
      target_id: target.targetId,
      amount_ngn: target.amountNgn,
      status: 'pending',
    })
    if (intentError) throw intentError

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: Math.round(target.amountNgn * 100).toString(),
        currency: 'NGN',
        reference,
        callback_url: callback.toString(),
        metadata: JSON.stringify({
          maxmarkPurpose: body.purpose,
          maxmarkTargetId: target.targetId,
          maxmarkUserId: user.id,
        }),
      }),
    })
    const payload = (await paystackResponse.json().catch(() => ({}))) as PaystackInitializeResponse

    if (!paystackResponse.ok || !payload.status || !payload.data) {
      await admin.from('payment_intents').update({ status: 'failed' }).eq('reference', reference)
      throw new Error(payload.message ?? `Paystack returned HTTP ${paystackResponse.status}`)
    }

    const authorizationUrl = new URL(payload.data.authorization_url)
    if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== 'checkout.paystack.com') {
      await admin.from('payment_intents').update({ status: 'failed' }).eq('reference', reference)
      throw new Error('Paystack returned an invalid checkout URL')
    }

    return jsonResponse({
      success: true,
      data: { authorizationUrl: authorizationUrl.toString(), reference },
    })
  } catch (error) {
    console.error('initialize-payment failed:', error)
    if (pendingReference) {
      await admin.from('payment_intents').update({ status: 'failed' }).eq('reference', pendingReference)
    }
    const safeMessages = new Set([
      'Invoice not found',
      'Invoice is not payable',
      'Marketplace item not found',
      'This marketplace item is temporarily unavailable',
      'This marketplace item is already owned',
      'Unable to verify the hosting subscription',
      'An active hosting plan is required',
    ])
    const message = error instanceof Error && safeMessages.has(error.message)
      ? error.message
      : 'Unable to initialize payment'
    return errorResponse(message, 400)
  }
})
