-- Migration 005 — Fix blank conversation preview for attachment-only messages
--
-- Migration 004 allowed support_messages.body to be empty when an attachment
-- is present, but support_conversation_bump() still derived
-- last_message_preview from left(new.body, 120) — so attachment-only
-- messages blanked the conversation list preview for both the customer
-- widget and the admin inbox. Falls back to the attachment name when body
-- is empty and an attachment is present.
--
-- Safe to run once. Re-running schema.sql afterward is idempotent.

create or replace function public.support_conversation_bump()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_conversations
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.body = '' and new.attachment_key is not null
          then '📎 ' || coalesce(new.attachment_name, 'Attachment')
        else left(new.body, 120)
      end,
      user_unread_count = user_unread_count
        + case when new.sender_role = 'admin' then 1 else 0 end,
      admin_unread_count = admin_unread_count
        + case when new.sender_role = 'user' then 1 else 0 end,
      status = case
        when new.sender_role = 'user' then 'open'::public.support_conversation_status
        when new.sender_role = 'admin' and status = 'open'
          then 'pending'::public.support_conversation_status
        else status
      end
  where id = new.conversation_id;
  return new;
end;
$$;
