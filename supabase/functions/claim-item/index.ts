// POST /functions/v1/claim-item
// Body: { "itemId": "<marketplace_plugins uuid>" }
//
// Claims a marketplace item (plugin or theme) that is included in the
// caller's subscription tier. The tier is resolved server-side from the
// user's active hosting plans via rpc marketplace_tier_for_user() — the
// client can never self-grant a licence:
//   Launch → 1 · Standard/Scale → 2 · VIP → 3 · no active plan → 0
//
// Succeeds only when item.tier <= user tier. Issues a ₦0 licence with
// acquisition = 'subscription'. Idempotent: an existing (user, item)
// licence is returned as-is.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { generateLicenseKey } from '../_shared/license.ts'

const bodySchema = z.object({
  itemId: z.string().uuid(),
})

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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: item, error: itemError } = await admin
    .from('marketplace_plugins')
    .select('id, slug, tier, status, download_asset_path')
    .eq('id', body.itemId)
    .single()

  if (itemError || !item || item.status !== 'active') {
    return errorResponse('Item not found', 404)
  }
  if (!item.download_asset_path) {
    return errorResponse('This item is temporarily unavailable for download.', 409)
  }

  const { data: userTier, error: tierError } = await admin.rpc(
    'marketplace_tier_for_user',
    { uid: user.id },
  )

  if (tierError) {
    console.error('marketplace_tier_for_user failed:', tierError)
    return errorResponse('Unable to resolve subscription tier', 500)
  }

  if (!userTier || userTier === 0) {
    return errorResponse(
      'An active hosting plan is required to use the marketplace.',
      403,
    )
  }

  if (item.tier > userTier) {
    return errorResponse(
      `This item requires marketplace tier ${item.tier}; your plan grants tier ${userTier}. It can be purchased individually.`,
      403,
    )
  }

  // Idempotent: return the existing licence if one exists.
  const { data: existing } = await admin
    .from('plugin_purchases')
    .select('*')
    .eq('user_id', user.id)
    .eq('plugin_id', item.id)
    .maybeSingle()

  if (existing) {
    return jsonResponse({ success: true, data: { purchase: existing } })
  }

  const { data: purchase, error: purchaseError } = await admin
    .from('plugin_purchases')
    .insert({
      user_id: user.id,
      plugin_id: item.id,
      license_key: generateLicenseKey(item.slug),
      amount_paid_ngn: 0,
      acquisition: 'subscription',
      status: 'active',
    })
    .select()
    .single()

  if (purchaseError) {
    console.error('claim insert failed:', purchaseError)
    return errorResponse('Unable to record the claim', 500)
  }

  return jsonResponse({ success: true, data: { purchase } })
})
