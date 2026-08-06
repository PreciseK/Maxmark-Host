import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import { initializePayment, type PaymentPurpose } from '@/lib/functions'
import { navigateToPaystackCheckout } from '@/lib/paystack'
import { supabase } from '@/lib/supabase'

interface PaystackCheckoutProps {
  payment: PaymentPurpose
  onError?: (message: string) => void
  className?: string
  label?: string
}
export function PaystackCheckout({
  payment,
  onError,
  className,
  label = 'Pay Now',
}: PaystackCheckoutProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (!supabase) {
      onError?.('Payments are unavailable until Maxmark is configured.')
      return
    }

    setLoading(true)
    try {
      const { authorizationUrl } = await initializePayment(supabase, payment)
      navigateToPaystackCheckout(authorizationUrl)
    } catch (error) {
      setLoading(false)
      onError?.(error instanceof Error ? error.message : 'Unable to start checkout.')
    }
  }

  return (
    <button
      aria-busy={loading}
      className={
        className ??
        'inline-flex min-h-11 items-center gap-1.5 rounded bg-[#5c4df0] px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#4d3fe0] disabled:opacity-50'
      }
      disabled={loading}
      onClick={() => void handleClick()}
      type="button"
    >
      {loading && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
      {loading ? 'Opening checkout…' : label}
    </button>
  )
}
