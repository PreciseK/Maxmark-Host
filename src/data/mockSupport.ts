import type { SupportConversation, SupportMessage } from '@/lib/db/support'

// Demo dataset for support chat. The "customer" is the demo persona
// (mock-user-1 / Gloria Belleboa, matching mockAdmin.ts); the agent side is
// mock-admin-1. Both the customer widget and the admin inbox render from
// this set in demo mode.

const minutesAgo = (minutes: number) => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - minutes)
  return d.toISOString()
}

export const DEMO_USER_ID = 'mock-user-1'
export const DEMO_ADMIN_ID = 'mock-admin-1'

export const mockConversations: SupportConversation[] = [
  {
    id: 'mock-conv-1',
    userId: DEMO_USER_ID,
    subject: 'Payment extension for VIP renewal',
    status: 'open',
    lastMessageAt: minutesAgo(42),
    lastMessagePreview: 'Thanks — could you extend the due date to next Friday?',
    userUnreadCount: 0,
    adminUnreadCount: 1,
    createdAt: minutesAgo(60 * 26),
  },
  {
    id: 'mock-conv-2',
    userId: DEMO_USER_ID,
    subject: 'Malware scan on completeproperty.co.za',
    status: 'pending',
    lastMessageAt: minutesAgo(60 * 5),
    lastMessagePreview: 'Scan finished clean — we also hardened wp-login. Anything else?',
    userUnreadCount: 1,
    adminUnreadCount: 0,
    createdAt: minutesAgo(60 * 49),
  },
  {
    id: 'mock-conv-3',
    userId: DEMO_USER_ID,
    subject: 'Disable recaptcha on checkout',
    status: 'closed',
    lastMessageAt: minutesAgo(60 * 24 * 6),
    lastMessagePreview: 'Perfect, that fixed it. Thank you!',
    userUnreadCount: 0,
    adminUnreadCount: 0,
    createdAt: minutesAgo(60 * 24 * 7),
  },
]

export const mockMessagesByConversation: Record<string, SupportMessage[]> = {
  'mock-conv-1': [
    {
      id: 'mock-msg-1a',
      conversationId: 'mock-conv-1',
      senderId: DEMO_USER_ID,
      senderRole: 'user',
      body: 'Hi — my VIP plan renewal invoice is due tomorrow but our finance run is next week. Can I get a short extension?',
      createdAt: minutesAgo(60 * 26),
    },
    {
      id: 'mock-msg-1b',
      conversationId: 'mock-conv-1',
      senderId: DEMO_ADMIN_ID,
      senderRole: 'admin',
      body: 'Hello Gloria! We can definitely help with that. How much time do you need?',
      createdAt: minutesAgo(60 * 2),
    },
    {
      id: 'mock-msg-1c',
      conversationId: 'mock-conv-1',
      senderId: DEMO_USER_ID,
      senderRole: 'user',
      body: 'Thanks — could you extend the due date to next Friday?',
      createdAt: minutesAgo(42),
    },
  ],
  'mock-conv-2': [
    {
      id: 'mock-msg-2a',
      conversationId: 'mock-conv-2',
      senderId: DEMO_USER_ID,
      senderRole: 'user',
      body: 'Our monitoring flagged possible malware on completeproperty.co.za. Can you run a scan?',
      createdAt: minutesAgo(60 * 49),
    },
    {
      id: 'mock-msg-2b',
      conversationId: 'mock-conv-2',
      senderId: DEMO_ADMIN_ID,
      senderRole: 'admin',
      body: 'On it — running a full scan now, will report back shortly.',
      createdAt: minutesAgo(60 * 47),
    },
    {
      id: 'mock-msg-2c',
      conversationId: 'mock-conv-2',
      senderId: DEMO_ADMIN_ID,
      senderRole: 'admin',
      body: 'Scan finished clean — we also hardened wp-login. Anything else?',
      createdAt: minutesAgo(60 * 5),
    },
  ],
  'mock-conv-3': [
    {
      id: 'mock-msg-3a',
      conversationId: 'mock-conv-3',
      senderId: DEMO_USER_ID,
      senderRole: 'user',
      body: 'Customers report recaptcha blocking checkout on mobile. Can we disable it on the checkout form only?',
      createdAt: minutesAgo(60 * 24 * 7),
    },
    {
      id: 'mock-msg-3b',
      conversationId: 'mock-conv-3',
      senderId: DEMO_ADMIN_ID,
      senderRole: 'admin',
      body: 'Done — recaptcha is now skipped on /checkout while staying active on login and comments.',
      createdAt: minutesAgo(60 * 24 * 6 - 20),
    },
    {
      id: 'mock-msg-3c',
      conversationId: 'mock-conv-3',
      senderId: DEMO_USER_ID,
      senderRole: 'user',
      body: 'Perfect, that fixed it. Thank you!',
      createdAt: minutesAgo(60 * 24 * 6),
    },
  ],
}

export const cannedAdminReply =
  'Thanks for reaching out! A Maxmark engineer has picked this up and will reply shortly. (Demo auto-reply)'
