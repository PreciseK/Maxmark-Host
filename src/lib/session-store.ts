import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

// Context plumbing for SessionProvider (session-context.tsx). Kept in its
// own module so the provider file only exports a component (react-refresh).

export interface SessionContextValue {
  session: Session | null
  /** True when the signed-in user holds the 'admin' role in user_roles. */
  isAdmin: boolean
  /** True when Supabase env vars are absent and the app runs on mock data. */
  isDemo: boolean
  /** The signed-in user's avatar (R2 public URL), if one has been uploaded. */
  avatarUrl: string | null
  setAvatarUrl: (url: string | null) => void
  /**
   * False until the admin-role lookup for the current session settles.
   * Route guards wait on this to avoid redirecting mid-lookup.
   */
  roleResolved: boolean
  /** Sum of the signed-in user's unread support messages (customer side). */
  supportUnread: number
  setSupportUnread: (count: number) => void
  /** Sum of unread customer messages across conversations (admin side). */
  adminSupportUnread: number
  setAdminSupportUnread: (count: number) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>')
  }
  return value
}
