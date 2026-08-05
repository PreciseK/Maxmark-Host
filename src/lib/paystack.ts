const PAYSTACK_CHECKOUT_HOST = 'checkout.paystack.com'

export function navigateToPaystackCheckout(value: string): void {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== PAYSTACK_CHECKOUT_HOST) {
    throw new Error('The payment provider returned an invalid checkout URL.')
  }

  window.location.assign(url.toString())
}

export function paymentReferenceFromSearch(search: URLSearchParams): string | null {
  if (search.get('payment_return') !== '1') return null
  const reference = search.get('reference') ?? search.get('trxref')
  return reference && /^MH-[A-Za-z0-9.=-]{10,160}$/.test(reference) ? reference : null
}
