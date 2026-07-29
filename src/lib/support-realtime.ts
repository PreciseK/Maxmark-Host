import type { SupabaseClient } from '@supabase/supabase-js'

import { mapConversation, mapMessage } from '@/lib/db/support'
import type { SupportConversation, SupportMessage } from '@/lib/db/support'

// Realtime wiring for support chat. postgres_changes events are authorized
// per-socket against RLS, so a customer only receives rows for their own
// conversations and admins receive everything. Each helper returns an
// unsubscribe function for effect cleanup.

type Cleanup = () => void

/** New messages in one open thread. */
export function subscribeToConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  onMessage: (message: SupportMessage) => void,
): Cleanup {
  const channel = supabase
    .channel(`support-conv-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onMessage(mapMessage(payload.new as Record<string, unknown>)),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

/** Changes to the signed-in customer's conversations (badge + list order). */
export function subscribeToUserConversations(
  supabase: SupabaseClient,
  userId: string,
  onChange: (conversation: SupportConversation) => void,
): Cleanup {
  const channel = supabase
    .channel(`support-user-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'support_conversations',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new && Object.keys(payload.new).length > 0) {
          onChange(mapConversation(payload.new as Record<string, unknown>))
        }
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * All conversation inserts/updates — admin inbox live view (RLS-gated).
 * `channelKey` must differ per subscriber (channel names are unique per
 * client; the inbox page and the shell badge each keep their own).
 */
export function subscribeToAdminInbox(
  supabase: SupabaseClient,
  onChange: (conversation: SupportConversation) => void,
  channelKey = 'support-admin',
): Cleanup {
  const channel = supabase
    .channel(channelKey)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'support_conversations' },
      (payload) => {
        if (payload.new && Object.keys(payload.new).length > 0) {
          onChange(mapConversation(payload.new as Record<string, unknown>))
        }
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
