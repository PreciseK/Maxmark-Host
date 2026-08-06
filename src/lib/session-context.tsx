import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { fetchUserUnreadTotal } from '@/lib/db/support'
import { SessionContext } from '@/lib/session-store'
import { supabase } from '@/lib/supabase'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [supportPin, setSupportPin] = useState<string | null>(null)
  const [roleResolved, setRoleResolved] = useState(false)
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
          setAvatarUrl(null)
          setAccountId(null)
          setSupportPin(null)
          setRoleResolved(true)
        }
        return
      }
      try {
        const [roleRes, profileRes] = await Promise.all([
          sb
            .from('user_roles')
            .select('role')
            .eq('user_id', next.user.id)
            .eq('role', 'admin')
            .limit(1),
          sb
            .from('user_profiles')
            .select('avatar_url, account_id, support_pin')
            .eq('user_id', next.user.id)
            .maybeSingle(),
        ])
        if (roleRes.error) throw roleRes.error
        if (!cancelled) {
          setIsAdmin((roleRes.data?.length ?? 0) > 0)
          setAvatarUrl((profileRes.data?.avatar_url as string | null | undefined) ?? null)
          setAccountId((profileRes.data?.account_id as string | null | undefined) ?? null)
          setSupportPin((profileRes.data?.support_pin as string | null | undefined) ?? null)
        }
      } catch (error) {
        console.warn('Admin role lookup failed; treating as non-admin:', error)
        if (!cancelled) {
          setIsAdmin(false)
          setAvatarUrl(null)
          setAccountId(null)
          setSupportPin(null)
        }
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
  useEffect(() => {
    if (!supabase || !session) {
      setSupportUnread(0)
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
  }, [session])

  return (
    <SessionContext.Provider
      value={{
        session,
        isAdmin,
        avatarUrl,
        accountId,
        supportPin,
        setAvatarUrl,
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
