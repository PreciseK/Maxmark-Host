declare global {
  interface Window {
    PaystackPop: {
      setup: (config: PaystackSetupConfig) => { openIframe: () => void }
    }
  }
}

interface PaystackSetupConfig {
  key: string
  email: string
  amount: number
  currency: 'NGN'
  ref: string
  metadata?: Record<string, unknown>
  callback: (transaction: { reference: string }) => void
  onClose: () => void
}

export interface PaystackCheckoutOptions {
  email: string
  amountNgn: number
  ref: string
  metadata?: Record<string, unknown>
  onSuccess: (reference: string) => void
  onCancel?: () => void
  onError?: (message: string) => void
}

const PAYSTACK_SCRIPT_URL = 'https://js.paystack.co/v1/inline.js'

export function isPaystackConfigured(): boolean {
  return Boolean(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY)
}

export function ngnToKobo(ngn: number): number {
  return Math.round(ngn * 100)
}

export function generateRef(prefix = 'MH'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function launchPopup(key: string, opts: PaystackCheckoutOptions): void {
  const handler = window.PaystackPop.setup({
    key,
    email: opts.email,
    amount: ngnToKobo(opts.amountNgn),
    currency: 'NGN',
    ref: opts.ref,
    metadata: opts.metadata,
    callback: (tx) => opts.onSuccess(tx.reference),
    onClose: () => opts.onCancel?.(),
  })
  handler.openIframe()
}

let scriptPromise: Promise<void> | null = null

function loadPaystackScript(): Promise<void> {
  if (window.PaystackPop) return Promise.resolve()

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = PAYSTACK_SCRIPT_URL
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        // Allow a retry on the next click instead of caching the failure.
        scriptPromise = null
        script.remove()
        reject(new Error('Could not load the Paystack checkout script.'))
      }
      document.head.appendChild(script)
    })
  }

  return scriptPromise
}

export function openPaystackCheckout(opts: PaystackCheckoutOptions): void {
  const key = (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined) ?? ''
  if (!key) {
    opts.onError?.(
      'Paystack is not configured. Set VITE_PAYSTACK_PUBLIC_KEY in your .env file.',
    )
    return
  }

  loadPaystackScript()
    .then(() => launchPopup(key, opts))
    .catch((error: unknown) => {
      opts.onError?.(
        error instanceof Error ? error.message : 'Paystack failed to load.',
      )
    })
}
