import { useEffect, useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function SessionExpiredModal() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabase) return

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Show session expired modal if signed out unexpectedly
        setIsOpen(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (!isOpen) return null

  function handleReAuthenticate() {
    setIsOpen(false)
    navigate('/login', { state: { from: window.location.pathname } })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Modal */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/30 bg-[#121214] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
          <KeyRound className="h-7 w-7" />
        </div>

        <h3 className="mb-2 text-xl font-semibold text-white">Session Expired</h3>
        <p className="mb-6 text-sm leading-6 text-white/60">
          Your authentication token has expired or signed out. Please re-authenticate to continue working safely.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleReAuthenticate}
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5c4df0] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-[#6c5df5]"
          >
            <LogIn className="h-4 w-4" />
            Sign in again
          </button>
        </div>
      </div>
    </div>
  )
}
