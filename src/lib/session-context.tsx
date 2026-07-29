import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { fetchUserUnreadTotal } from '@/lib/db/support'
import { SessionContext } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'

export function SessionProvider({ children }: { children: ReactNode }) {
  const isDemo = supabase === null
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [roleResolved, setRoleResolved] = useState(isDemo)
  const [supportUnread, setSupportUnread] = useState(0)
  const [adminSupportUnread, setAdminSupportUnread] = useState(0)

  useEffect(() => {
    if (!supabase) return
    const sb = supabase

    let cancelled = false

    async function resolveRole(next: Session | null) {
      if (!next) {
        if (!cancelled) {
          setIsAdmin(false)
          setRoleResolved(true)
        }
        return
      }
      try {
        const { data, error } = await sb
          .from('user_roles')
          .select('role')
          .eq('user_id', next.user.id)
          .eq('role', 'admin')
          .limit(1)
        if (error) throw error
        if (!cancelled) setIsAdmin((data?.length ?? 0) > 0)
      } catch (error) {
        console.warn('Admin role lookup failed; treating as non-admin:', error)
        if (!cancelled) setIsAdmin(false)
      } finally {
        if (!cancelled) setRoleResolved(true)
      }
    }

    sb.auth.getSession().then(({ data: { session: current } }) => {
      if (cancelled) return
      setSession(current)
      void resolveRole(current)
    })

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setRoleResolved(false)
      void resolveRole(next)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  // Global unread badge (customer side): total user_unread_count across the
  // signed-in user's conversations, refreshed on any change to their rows.
  // Demo mode is handled by useSupportChat, which sets the badge directly.
  useEffect(() => {
    if (!supabase || !session) {
      if (!isDemo) setSupportUnread(0)
      return
    }
    const sb = supabase
    let cancelled = false

    const refresh = () => {
      fetchUserUnreadTotal(sb)
        .then((total) => {
          if (!cancelled) setSupportUnread(total)
        })
        .catch(() => undefined)
    }

    refresh()

    const channel = sb
      .channel(`support-user-badge-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_conversations',
          filter: `user_id=eq.${session.user.id}`,
        },
        refresh,
      )
      .subscribe()

    return () => {
      cancelled = true
      void sb.removeChannel(channel)
    }
  }, [session, isDemo])

  return (
    <SessionContext.Provider
      value={{
        session,
        isAdmin,
        isDemo,
        roleResolved,
        supportUnread,
        setSupportUnread,
        adminSupportUnread,
        setAdminSupportUnread,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
