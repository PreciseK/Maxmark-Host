import type { SupabaseClient } from '@supabase/supabase-js'

export type ConversationStatus = 'open' | 'pending' | 'closed'
export type SenderRole = 'user' | 'admin'

export interface SupportConversation {
  id: string
  userId: string
  subject: string
  status: ConversationStatus
  lastMessageAt: string
  lastMessagePreview: string
  userUnreadCount: number
  adminUnreadCount: number
  createdAt: string
}

export interface SupportMessage {
  id: string
  conversationId: string
  senderId: string
  senderRole: SenderRole
  body: string
  createdAt: string
}

type Row = Record<string, unknown>

export function mapConversation(r: Row): SupportConversation {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    subject: r.subject as string,
    status: r.status as ConversationStatus,
    lastMessageAt: r.last_message_at as string,
    lastMessagePreview: r.last_message_preview as string,
    userUnreadCount: Number(r.user_unread_count),
    adminUnreadCount: Number(r.admin_unread_count),
    createdAt: r.created_at as string,
  }
}

export function mapMessage(r: Row): SupportMessage {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    senderId: r.sender_id as string,
    senderRole: r.sender_role as SenderRole,
    body: r.body as string,
    createdAt: r.created_at as string,
  }
}

/** Caller's own conversations (RLS scopes the rows). */
export async function fetchConversations(
  supabase: SupabaseClient,
): Promise<SupportConversation[]> {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapConversation)
}

/** All conversations — requires the admin RLS policy. */
export async function fetchAdminInbox(
  supabase: SupabaseClient,
  status?: ConversationStatus,
): Promise<SupportConversation[]> {
  let query = supabase
    .from('support_conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapConversation)
}

export async function fetchMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<SupportMessage[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapMessage)
}

/**
 * Insert a message. sender_id / sender_role are ignored server-side — the
 * BEFORE-INSERT trigger derives them from the caller's JWT.
 */
export async function sendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  body: string,
): Promise<SupportMessage> {
  const { data, error } = await supabase
    .from('support_messages')
    .insert({ conversation_id: conversationId, body })
    .select()
    .single()
  if (error) throw error
  return mapMessage(data as Row)
}

export async function createConversation(
  supabase: SupabaseClient,
  subject: string,
  firstMessage: string,
): Promise<{ conversation: SupportConversation; message: SupportMessage }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('You must be signed in to open a case.')

  const { data: convRow, error: convError } = await supabase
    .from('support_conversations')
    .insert({ user_id: user.id, subject })
    .select()
    .single()
  if (convError) throw convError

  const conversation = mapConversation(convRow as Row)
  const message = await sendMessage(supabase, conversation.id, firstMessage)
  return { conversation, message }
}

/** Zero the caller's own unread counter for one conversation. */
export async function markConversationRead(
  supabase: SupabaseClient,
  conversationId: string,
  side: SenderRole,
): Promise<void> {
  const patch =
    side === 'user' ? { user_unread_count: 0 } : { admin_unread_count: 0 }
  const { error } = await supabase
    .from('support_conversations')
    .update(patch)
    .eq('id', conversationId)
  if (error) throw error
}

export async function setConversationStatus(
  supabase: SupabaseClient,
  conversationId: string,
  status: ConversationStatus,
): Promise<void> {
  const { error } = await supabase
    .from('support_conversations')
    .update({ status })
    .eq('id', conversationId)
  if (error) throw error
}

export async function fetchUserUnreadTotal(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('user_unread_count')
  if (error) throw error
  return (data ?? []).reduce(
    (sum: number, r: Row) => sum + Number(r.user_unread_count),
    0,
  )
}

export async function fetchAdminUnreadTotal(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('admin_unread_count')
    .neq('status', 'closed')
  if (error) throw error
  return (data ?? []).reduce(
    (sum: number, r: Row) => sum + Number(r.admin_unread_count),
    0,
  )
}
