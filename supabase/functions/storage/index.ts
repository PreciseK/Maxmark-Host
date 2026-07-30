// supabase/functions/storage/index.ts
// POST /functions/v1/storage
// Body: { purpose: <discriminant>, ...payload }
//
// Issues short-lived presigned R2 URLs after authorizing the caller. Same
// trust-boundary shape as verify-payment/admin-actions: JWT -> anon client
// resolves the caller, then a service-role client does the privileged work
// (looking up ownership, bumping counters) before a URL is ever handed back.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { presignGet, presignPut } from '../_shared/r2.ts'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB

const ATTACHMENT_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/zip',
])

const AVATAR_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const bodySchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('plugin-download'),
    pluginId: z.string().uuid(),
  }),
  z.object({
    purpose: z.literal('chat-attachment-upload'),
    conversationId: z.string().uuid(),
    fileName: z.string().min(1).max(200),
    contentType: z.string().min(1),
    contentLength: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  }),
  z.object({
    purpose: z.literal('chat-attachment-download'),
    messageId: z.string().uuid(),
  }),
  z.object({
    purpose: z.literal('avatar-upload'),
    contentType: z.string().min(1),
    contentLength: z.number().int().positive().max(MAX_AVATAR_BYTES),
  }),
])

type Body = z.infer<typeof bodySchema>

class StorageError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new StorageError(`${name} is not configured`, 500)
  return value
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  }
  return map[contentType] ?? 'bin'
}

async function pluginDownload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: Extract<Body, { purpose: 'plugin-download' }>,
) {
  const { data: purchase, error: purchaseError } = await admin
    .from('plugin_purchases')
    .select('id, status')
    .eq('user_id', userId)
    .eq('plugin_id', body.pluginId)
    .eq('status', 'active')
    .maybeSingle()
  if (purchaseError) throw new StorageError(purchaseError.message, 500)
  if (!purchase) throw new StorageError('No active license for this item', 403)

  const { data: plugin, error: pluginError } = await admin
    .from('marketplace_plugins')
    .select('download_asset_path')
    .eq('id', body.pluginId)
    .single()
  if (pluginError || !plugin) throw new StorageError('Item not found', 404)
  if (!plugin.download_asset_path) {
    throw new StorageError('No uploaded asset for this item yet', 404)
  }

  const { data: current, error: currentError } = await admin
    .from('plugin_purchases')
    .select('download_count')
    .eq('id', purchase.id)
    .single()
  if (currentError) throw new StorageError(currentError.message, 500)

  const { error: updateError } = await admin
    .from('plugin_purchases')
    .update({
      download_count: Number(current.download_count) + 1,
      last_downloaded_at: new Date().toISOString(),
    })
    .eq('id', purchase.id)
  if (updateError) throw new StorageError(updateError.message, 500)

  const url = await presignGet(
    requireEnv('R2_PRIVATE_BUCKET'),
    plugin.download_asset_path,
    300,
  )
  return { downloadUrl: url }
}

async function chatAttachmentUpload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  isAdmin: boolean,
  body: Extract<Body, { purpose: 'chat-attachment-upload' }>,
) {
  if (!ATTACHMENT_CONTENT_TYPES.has(body.contentType)) {
    throw new StorageError('Unsupported attachment type', 400)
  }

  const { data: conversation, error } = await admin
    .from('support_conversations')
    .select('id, user_id')
    .eq('id', body.conversationId)
    .single()
  if (error || !conversation) throw new StorageError('Conversation not found', 404)
  if (conversation.user_id !== userId && !isAdmin) {
    throw new StorageError('Not authorized for this conversation', 403)
  }

  const key = `support/${body.conversationId}/${crypto.randomUUID()}-${sanitizeFileName(body.fileName)}`
  const uploadUrl = await presignPut(
    requireEnv('R2_PRIVATE_BUCKET'),
    key,
    body.contentType,
    body.contentLength,
    600,
  )
  return { key, uploadUrl }
}

async function chatAttachmentDownload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  isAdmin: boolean,
  body: Extract<Body, { purpose: 'chat-attachment-download' }>,
) {
  const { data: message, error } = await admin
    .from('support_messages')
    .select('attachment_key, conversation_id, support_conversations!inner(user_id)')
    .eq('id', body.messageId)
    .single()
  if (error || !message || !message.attachment_key) {
    throw new StorageError('Attachment not found', 404)
  }
  const ownerId = (
    message.support_conversations as unknown as { user_id: string }
  ).user_id
  if (ownerId !== userId && !isAdmin) {
    throw new StorageError('Not authorized for this attachment', 403)
  }

  const url = await presignGet(requireEnv('R2_PRIVATE_BUCKET'), message.attachment_key, 300)
  return { downloadUrl: url }
}

async function avatarUpload(
  userId: string,
  body: Extract<Body, { purpose: 'avatar-upload' }>,
) {
  if (!AVATAR_CONTENT_TYPES.has(body.contentType)) {
    throw new StorageError('Unsupported avatar type', 400)
  }
  const key = `avatars/${userId}.${extensionFor(body.contentType)}`
  const uploadUrl = await presignPut(
    requireEnv('R2_PUBLIC_BUCKET'),
    key,
    body.contentType,
    body.contentLength,
    600,
  )
  const publicUrl = `${requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, '')}/${key}`
  return { uploadUrl, publicUrl }
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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: roleRows } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .limit(1)
  const isAdmin = (roleRows?.length ?? 0) > 0

  let body: Body
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  try {
    switch (body.purpose) {
      case 'plugin-download':
        return jsonResponse({ success: true, data: await pluginDownload(admin, user.id, body) })
      case 'chat-attachment-upload':
        return jsonResponse({
          success: true,
          data: await chatAttachmentUpload(admin, user.id, isAdmin, body),
        })
      case 'chat-attachment-download':
        return jsonResponse({
          success: true,
          data: await chatAttachmentDownload(admin, user.id, isAdmin, body),
        })
      case 'avatar-upload':
        return jsonResponse({ success: true, data: await avatarUpload(user.id, body) })
    }
  } catch (error) {
    if (error instanceof StorageError) {
      return errorResponse(error.message, error.status)
    }
    console.error(`storage ${body.purpose} failed:`, error)
    return errorResponse('Storage request failed', 500)
  }
})
