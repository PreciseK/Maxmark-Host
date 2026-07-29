import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useSession } from '@/lib/session-store'

/**
 * Gate for the /admin tree.
 *
 * Demo mode (no Supabase env vars) renders freely — the whole app runs on
 * mock data with zero config, and /admin follows the same philosophy. With
 * Supabase configured, a session is required and the user must hold the
 * 'admin' role in user_roles.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { session, isAdmin, isDemo, roleResolved } = useSession()

  if (isDemo) return <>{children}</>

  if (!roleResolved) {
    return <div className="min-h-screen bg-[#121214]" />
  }

  if (!session) return <Navigate replace to="/login" />
  if (!isAdmin) return <Navigate replace to="/home" />

  return <>{children}</>
}
