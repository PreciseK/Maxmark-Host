// POST /functions/v1/provision-site
// Body: { "siteDomain": "client-site.com", "siteType": "wordpress" }
//
// Provisions a site for the *authenticated caller*. The user id is taken from
// the verified JWT — never from the request body. WHM credentials and the
// service-role key only ever exist in this server context.
//
// Supported siteType values:
//   "wordpress" (default) — WordPress install + MySQL
//   "nextjs"              — Node.js App Manager + no MySQL
//   "static"              — document root only, no DB, no Node.js
//   "nodejs"              — Node.js App Manager + no MySQL (generic)
//
// Secrets (supabase secrets set):
//   WHM_HOST, WHM_PORT, WHM_API_USERNAME, WHM_MASTER_TOKEN, MOCK_WHM_REQUESTS

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import {
  createMockWhmExecutor,
  ProvisioningError,
  provisionSite,
} from '../_shared/provisioner.ts'

const bodySchema = z.object({
  siteDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/,
      'siteDomain must be a valid domain like client-site.com',
    ),
  siteType: z.enum(['wordpress', 'nextjs', 'static', 'nodejs']).default('wordpress'),
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

  // Resolve the caller from their JWT with the anon client.
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
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Invalid request body'
        : 'Invalid request body'
    return errorResponse(message, 400)
  }

  const useMockWhm =
    (Deno.env.get('MOCK_WHM_REQUESTS') ?? 'true').toLowerCase() === 'true'

  try {
    const result = await provisionSite(
      { userId: user.id, siteDomain: body.siteDomain, siteType: body.siteType },
      {
        env: Deno.env.toObject(),
        executor: useMockWhm ? createMockWhmExecutor() : undefined,
      },
    )

    // The database password is intentionally not returned — it stays between
    // the provisioner and the WordPress installer.
    return jsonResponse({
      success: true,
      data: {
        site: result.site,
        steps: result.steps,
        nodeSummary: result.nodeSummary,
      },
    })
  } catch (error) {
    if (error instanceof ProvisioningError) {
      return jsonResponse(
        { success: false, error: error.message, steps: error.steps },
        409,
      )
    }

    console.error('provision-site failed:', error)
    return errorResponse('Provisioning failed unexpectedly', 500)
  }
})
