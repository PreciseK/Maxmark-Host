import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useSession } from '@/lib/session-store'

/**
 * Gate for the /admin tree.
 *
 * Explicit demo mode renders sample data. In live mode a session is required
 * and the user must hold the
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
