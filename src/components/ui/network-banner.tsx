import { useEffect, useRef, useState } from 'react'
import { Wifi, WifiOff, ZapOff } from 'lucide-react'
import { useNetworkStatus } from '@/hooks/use-network-status'

export function NetworkBanner() {
  const { isOnline, isSlowConnection } = useNetworkStatus()
  const prevOnlineRef = useRef(isOnline)
  const [showReconnected, setShowReconnected] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      prevOnlineRef.current = false
    } else if (!prevOnlineRef.current) {
      prevOnlineRef.current = true
      const showTimer = setTimeout(() => {
        setShowReconnected(true)
      }, 0)
      const hideTimer = setTimeout(() => {
        setShowReconnected(false)
      }, 4000)

      return () => {
        clearTimeout(showTimer)
        clearTimeout(hideTimer)
      }
    }
  }, [isOnline])

  if (!isOnline) {
    return (
      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-black/85 px-5 py-3.5 shadow-2xl backdrop-blur-xl transition-all">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
            <WifiOff className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">No internet connection</h4>
            <p className="text-xs text-white/60">You are offline. Reconnecting automatically when network restores…</p>
          </div>
        </div>
      </div>
    )
  }

  if (showReconnected) {
    return (
      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-black/85 px-5 py-3.5 shadow-2xl backdrop-blur-xl transition-all">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Wifi className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Back online</h4>
            <p className="text-xs text-white/60">Connection restored. Syncing latest data.</p>
          </div>
        </div>
      </div>
    )
  }

  if (isSlowConnection) {
    return (
      <div className="fixed bottom-6 right-6 z-40">
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-black/80 px-4 py-3 shadow-xl backdrop-blur-xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
            <ZapOff className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">Slow network detected</h4>
            <p className="text-[11px] text-white/60">Responses may take slightly longer than usual.</p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
