import { useEffect, useState } from 'react'

export interface NetworkStatus {
  isOnline: boolean
  isSlowConnection: boolean
  effectiveType: string | null
  downlink: number | null
  rtt: number | null
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection
    const effectiveType = conn?.effectiveType ?? null
    const rtt = conn?.rtt ?? null
    const isSlowConnection = effectiveType === '2g' || effectiveType === 'slow-2g' || (rtt !== null && rtt > 1500)

    return {
      isOnline,
      isSlowConnection,
      effectiveType,
      downlink: conn?.downlink ?? null,
      rtt,
    }
  })

  useEffect(() => {
    function handleOnline() {
      setStatus((prev) => ({ ...prev, isOnline: true }))
    }

    function handleOffline() {
      setStatus((prev) => ({ ...prev, isOnline: false }))
    }

    function handleConnectionChange() {
      const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection
      const effectiveType = conn?.effectiveType ?? null
      const rtt = conn?.rtt ?? null
      const isSlowConnection = effectiveType === '2g' || effectiveType === 'slow-2g' || (rtt !== null && rtt > 1500)

      setStatus((prev) => ({
        ...prev,
        effectiveType,
        downlink: conn?.downlink ?? null,
        rtt,
        isSlowConnection,
      }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const conn = (navigator as unknown as { connection?: { addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void } }).connection
    if (conn?.addEventListener) {
      conn.addEventListener('change', handleConnectionChange)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (conn?.removeEventListener) {
        conn.removeEventListener('change', handleConnectionChange)
      }
    }
  }, [])

  return status
}
