import { AlertTriangle } from 'lucide-react'

export function ConfigurationError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0b0d] px-6 text-white">
      <section
        aria-labelledby="configuration-error-title"
        className="w-full max-w-xl rounded-xl border border-amber-500/30 bg-amber-500/10 p-7"
        role="alert"
      >
        <AlertTriangle aria-hidden="true" className="mb-4 h-8 w-8 text-amber-400" />
        <h1 className="text-xl font-semibold" id="configuration-error-title">
          Configuration required
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/70">{message}</p>
      </section>
    </main>
  )
}

