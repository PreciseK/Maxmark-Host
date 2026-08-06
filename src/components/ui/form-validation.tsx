import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export interface InputValidationErrorProps {
  message?: string | null
  className?: string
}

export function InputValidationError({ message, className = '' }: InputValidationErrorProps) {
  if (!message) return null

  return (
    <div className={`mt-1.5 flex items-center gap-1.5 text-xs text-rose-400 ${className}`} role="alert">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export interface FormFieldProps {
  label: string
  htmlFor: string
  error?: string | null
  required?: boolean
  helperText?: string
  children: ReactNode
  className?: string
}

export function FormField({
  label,
  htmlFor,
  error,
  required,
  helperText,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-white/90">
          {label}
          {required ? <span className="ml-1 text-rose-400">*</span> : null}
        </label>
        {helperText ? <span className="text-xs text-white/40">{helperText}</span> : null}
      </div>

      <div className="relative">
        {children}
      </div>

      <InputValidationError message={error} />
    </div>
  )
}

export function FormSuccessBanner({ message }: { message: string }) {
  if (!message) return null

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-300">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
