import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { generateRef, openPaystackCheckout } from '@/lib/paystack'

interface PaystackCheckoutProps {
  email: string
  amountNgn: number
  description: string
  onSuccess: (reference: string) => void
  onError?: (message: string) => void
  className?: string
  label?: string
}

export function PaystackCheckout({
  email,
  amountNgn,
  description,
  onSuccess,
  onError,
  className,
  label = 'Pay Now',
}: PaystackCheckoutProps) {
  const [loading, setLoading] = useState(false)

  function handleClick() {
    setLoading(true)
    openPaystackCheckout({
      email,
      amountNgn,
      ref: generateRef(),
      metadata: { description },
      onSuccess: (ref) => {
        setLoading(false)
        onSuccess(ref)
      },
      onCancel: () => setLoading(false),
      onError: (message) => {
        setLoading(false)
        onError?.(message)
      },
    })
  }

  return (
    <button
      className={
        className ??
        'inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded text-[10px] font-bold text-white transition disabled:opacity-50'
      }
      disabled={loading}
      onClick={handleClick}
    >
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  )
}
