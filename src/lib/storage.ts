// Typed client bridge to the `storage` Edge Function — presigned R2 URLs
// for plugin downloads, chat attachments, and avatars. Mirrors the
// invoke<T>/FunctionEnvelope pattern in src/lib/functions.ts.

import type { SupabaseClient } from '@supabase/supabase-js'

interface FunctionEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

async function invokeStorage<T>(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<FunctionEnvelope<T>>('storage', {
    body,
  })
  if (error) throw new Error(`storage failed: ${error.message}`)
  if (!data?.success || data.data === undefined) {
    throw new Error(data?.error ?? 'storage returned no data')
  }
  return data.data
}

export async function getPluginDownloadUrl(
  supabase: SupabaseClient,
  pluginId: string,
): Promise<string> {
  const { downloadUrl } = await invokeStorage<{ downloadUrl: string }>(supabase, {
    purpose: 'plugin-download',
    pluginId,
  })
  return downloadUrl
}

export interface UploadedAttachment {
  key: string
  name: string
  size: number
  type: string
}

export async function uploadChatAttachment(
  supabase: SupabaseClient,
  conversationId: string,
  file: File,
): Promise<UploadedAttachment> {
  const { key, uploadUrl } = await invokeStorage<{ key: string; uploadUrl: string }>(
    supabase,
    {
      purpose: 'chat-attachment-upload',
      conversationId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      contentLength: file.size,
    },
  )

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!putResponse.ok) {
    throw new Error(`Attachment upload failed (${putResponse.status})`)
  }

  return { key, name: file.name, size: file.size, type: file.type }
}

export async function getChatAttachmentUrl(
  supabase: SupabaseClient,
  messageId: string,
): Promise<string> {
  const { downloadUrl } = await invokeStorage<{ downloadUrl: string }>(supabase, {
    purpose: 'chat-attachment-download',
    messageId,
  })
  return downloadUrl
}

export async function uploadAvatar(supabase: SupabaseClient, file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await invokeStorage<{
    uploadUrl: string
    publicUrl: string
  }>(supabase, {
    purpose: 'avatar-upload',
    contentType: file.type,
    contentLength: file.size,
  })

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!putResponse.ok) {
    throw new Error(`Avatar upload failed (${putResponse.status})`)
  }

  return publicUrl
}

export async function getPluginUploadUrl(
  supabase: SupabaseClient,
  pluginId: string,
  version: string,
  file: File,
): Promise<{ uploadUrl: string; key: string }> {
  const { data, error } = await supabase.functions.invoke<
    FunctionEnvelope<{ uploadUrl: string; key: string }>
  >('admin-actions', {
    body: {
      action: 'get_plugin_upload_url',
      pluginId,
      version,
      fileName: file.name,
      contentLength: file.size,
    },
  })
  if (error) throw new Error(`admin-actions failed: ${error.message}`)
  if (!data?.success || data.data === undefined) {
    throw new Error(data?.error ?? 'admin-actions returned no data')
  }
  return data.data
}
