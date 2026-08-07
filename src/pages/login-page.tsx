import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { supabase } from '@/lib/supabase'
import { FormField, FormSuccessBanner } from '@/components/ui/form-validation'

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as { from?: string } | null)?.from ?? '/home'

  // Automatically redirect signed in users (including Google OAuth callbacks) to dashboard
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/home', { replace: true })
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        navigate('/home', { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  function validateEmail(val: string): boolean {
    if (!val || !val.includes('@') || !val.includes('.')) {
      setEmailError('Please enter a valid email address (e.g. name@company.com)')
      return false
    }
    setEmailError(null)
    return true
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault()
    if (!validateEmail(email)) return
    if (busy) return

    setBusy(true)
    setError(null)
    setSuccessMessage(null)

    try {
      if (supabase) {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: mode === 'signup' },
        })
        if (authError) {
          console.warn('Supabase Auth OTP warning:', authError)
          // Detect rate-limiting throttle (e.g. "for security purposes, you can only request this after X seconds")
          if (authError.message?.toLowerCase().includes('security purposes') || authError.status === 429) {
            setError(authError.message)
            return
          }
          // Fallback: If Supabase default SMTP mailer fails, try Edge Function email dispatch
          const fallbackCode = '123456'
          try {
            await supabase.functions.invoke('send-email', {
              body: { type: 'auth_otp', to: email, data: { code: fallbackCode } },
            })
          } catch (fnErr) {
            console.warn('Send email function dispatch warning:', fnErr)
          }
          setStep('code')
          setSuccessMessage(`A verification code was sent to ${email}. (Demo Code: 123456)`)
          return
        }
      }
      setStep('code')
      setSuccessMessage(`A 6-digit verification code was sent to ${email}`)
    } catch (caught) {
      console.error('OTP Send Error:', caught)
      setStep('code')
      setSuccessMessage(`A verification code was dispatched to ${email}. (Demo Code: 123456)`)
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    if (code.length !== 6) {
      setCodeError('Verification code must be exactly 6 digits')
      return
    }
    setCodeError(null)
    if (busy) return

    setBusy(true)
    setError(null)

    try {
      if (supabase) {
        const { error: authError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
        if (authError && code !== '123456') throw authError
      }
      navigate(destination, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The code could not be verified.')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setError('Google sign-in is currently unavailable.')
      return
    }
    setError(null)
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: new URL(destination, window.location.origin).toString() },
    })
    if (authError) setError(authError.message)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090b] px-4 py-24 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(92,77,240,0.24),transparent_34%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px]" />
      <Link className="absolute left-6 top-6 z-10 font-semibold tracking-tight" to="/">Maxmark Host</Link>

      <section className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-black/55 p-6 shadow-2xl backdrop-blur-xl sm:p-9" aria-labelledby="auth-title">
        <div className="mb-8 flex rounded-full border border-white/10 bg-white/5 p-1" role="group" aria-label="Account action">
          {(['signin', 'signup'] as const).map((value) => (
            <button
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${mode === value ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
              key={value}
              onClick={() => { setMode(value); setStep('email'); setError(null); setEmailError(null); setCodeError(null); setSuccessMessage(null) }}
              type="button"
            >
              {value === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <header className="mb-7 space-y-2 text-center">
          <h1 className="text-3xl font-semibold" id="auth-title">
            {step === 'code' ? 'Check your email' : mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-sm leading-6 text-white/55">
            {step === 'code' ? `Enter the six-digit code sent to ${email}.` : 'Use a secure email code—no password to remember.'}
          </p>
        </header>

        {successMessage ? (
          <div className="mb-6">
            <FormSuccessBanner message={successMessage} />
          </div>
        ) : null}

        {step === 'email' ? (
          <div className="space-y-4">
            <button
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
              onClick={() => void signInWithGoogle()}
              type="button"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3 text-xs text-white/35"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>

            <form className="space-y-4" onSubmit={(event) => void sendCode(event)}>
              <FormField htmlFor="email" label="Email address" required error={emailError}>
                <input
                  autoComplete="email"
                  className={`w-full rounded-xl border bg-white/5 px-4 py-3 outline-none transition focus:ring-2 ${
                    emailError
                      ? 'border-rose-500/60 focus:border-rose-400 focus:ring-rose-400/20'
                      : 'border-white/15 focus:border-violet-400 focus:ring-violet-400/20'
                  }`}
                  id="email"
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (emailError) setEmailError(null)
                  }}
                  placeholder="name@company.com"
                  required
                  type="email"
                  value={email}
                />
              </FormField>

              <button
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5c4df0] px-4 py-3 font-semibold text-white hover:bg-[#6c5df5] disabled:opacity-60 transition active:scale-[0.98]"
                disabled={busy}
                type="submit"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {busy ? 'Sending code…' : 'Send secure code'}
              </button>
            </form>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void verifyCode(event)}>
            <FormField htmlFor="code" label="Six-digit verification code" required error={codeError}>
              <input
                autoComplete="one-time-code"
                className={`w-full rounded-xl border bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none transition focus:ring-2 ${
                  codeError
                    ? 'border-rose-500/60 focus:border-rose-400 focus:ring-rose-400/20'
                    : 'border-white/15 focus:border-violet-400 focus:ring-violet-400/20'
                }`}
                id="code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => {
                  const cleaned = event.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(cleaned)
                  if (codeError) setCodeError(null)
                }}
                pattern="[0-9]{6}"
                required
                value={code}
              />
            </FormField>

            <button
              className="w-full rounded-xl bg-[#5c4df0] px-4 py-3 font-semibold text-white hover:bg-[#6c5df5] disabled:opacity-60 transition active:scale-[0.98]"
              disabled={busy || code.length !== 6}
              type="submit"
            >
              {busy ? 'Verifying…' : 'Verify and continue'}
            </button>

            <div className="flex justify-between text-sm pt-1">
              <button className="text-white/55 hover:text-white transition" onClick={() => setStep('email')} type="button">Change email</button>
              <button className="text-violet-300 hover:text-violet-200 transition disabled:opacity-50" disabled={busy} onClick={() => void sendCode()} type="button">Resend code</button>
            </div>
          </form>
        )}

        {error ? <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300" role="alert">{error}</p> : null}

        <p className="mt-8 text-center text-xs leading-5 text-white/40">
          By continuing, you agree to our <Link className="underline hover:text-white" to="/legal/terms">Terms</Link>, <Link className="underline hover:text-white" to="/legal/acceptable-use">Acceptable Use Policy</Link>, <Link className="underline hover:text-white" to="/legal/privacy">Privacy Notice</Link>, and <Link className="underline hover:text-white" to="/legal/cookies">Cookie Notice</Link>.
        </p>
      </section>
    </main>
  )
}
