// POST /functions/v1/deprovision-site
// Body: { "siteId": "uuid" }
//
// Deprovisions a WordPress site from WHM/cPanel node and purges the database record.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import {
  createMockWhmExecutor,
  deprovisionWordPressSite,
} from '../_shared/provisioner.ts'

const bodySchema = z.object({
  siteId: z.string().uuid('siteId must be a valid UUID'),
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
    const result = await deprovisionWordPressSite(
      { siteId: body.siteId, userId: user.id },
      {
        env: Deno.env.toObject(),
        executor: useMockWhm ? createMockWhmExecutor() : undefined,
      },
    )

    return jsonResponse({
      success: true,
      data: result,
    })
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Deprovisioning failed',
      500,
    )
  }
})
