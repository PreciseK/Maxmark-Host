import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useSession } from '@/lib/session-store'

export function CustomerRoute({ children }: { children: ReactNode }) {
  const { session, roleResolved } = useSession()
  const location = useLocation()

  if (!roleResolved) {
    return (
      <div
        aria-label="Loading account"
        className="min-h-screen animate-pulse bg-[#121214]"
        role="status"
      />
    )
  }
  if (!session) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />
  }
  return <>{children}</>
}

