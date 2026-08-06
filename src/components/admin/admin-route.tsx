import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useSession } from '@/lib/session-store'

/**
 * Gate for the /admin tree.
 *
 * A session is required and the user must hold the 'admin' role in
 * user_roles. There is no demo or unconfigured bypass.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { session, isAdmin, roleResolved } = useSession()

  if (!roleResolved) {
    return <div className="min-h-screen bg-[#121214]" />
  }

  if (!session) return <Navigate replace to="/login" />
  if (!isAdmin) return <Navigate replace to="/home" />

  return <>{children}</>
}
