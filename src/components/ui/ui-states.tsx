import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  HelpCircle,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'

// ─── 1. EMPTY STATE ─────────────────────────────────────────────────────────
export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
  badge?: string
  actionLabel?: string
  onAction?: () => void
  actionLink?: string
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  secondaryActionLink?: string
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  badge,
  actionLabel,
  onAction,
  actionLink,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionLink,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center backdrop-blur-xl sm:p-12 ${className}`}
    >
      <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-indigo-600/10 blur-3xl" />

      {badge ? (
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-300">
          <Sparkles className="h-3 w-3" />
          {badge}
        </span>
      ) : null}

      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-violet-400 shadow-inner">
        {icon || <FolderOpen className="h-8 w-8 stroke-[1.5]" />}
      </div>

      <h3 className="mb-2 text-xl font-semibold tracking-tight text-white">{title}</h3>
      <p className="mb-6 max-w-md text-sm leading-6 text-white/60">{description}</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {actionLabel && actionLink ? (
          <Link
            to={actionLink}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5c4df0] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-[#6c5df5] active:scale-[0.98]"
          >
            {actionLabel}
          </Link>
        ) : actionLabel && onAction ? (
          <button
            onClick={onAction}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#5c4df0] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-[#6c5df5] active:scale-[0.98]"
          >
            {actionLabel}
          </button>
        ) : null}

        {secondaryActionLabel && secondaryActionLink ? (
          <Link
            to={secondaryActionLink}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {secondaryActionLabel}
          </Link>
        ) : secondaryActionLabel && onSecondaryAction ? (
          <button
            onClick={onSecondaryAction}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {secondaryActionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ─── 2. SKELETON LOADING STATES ──────────────────────────────────────────────
export interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
      aria-hidden="true"
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-2/3" />
      <div className="grid grid-cols-2 gap-3 pt-2">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
      <div className="border-b border-white/10 bg-white/5 px-6 py-4">
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16 justify-self-end" />
        </div>
      </div>
      <div className="divide-y divide-white/5 p-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <div className="grid grid-cols-4 items-center gap-4 px-4 py-3.5" key={idx}>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-8 w-20 justify-self-end rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  )
}

// ─── 3. ERROR STATE ──────────────────────────────────────────────────────────
export interface ErrorStateProps {
  title?: string
  message?: string
  error?: Error | string | null
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We ran into an issue while processing your request. Please try again.',
  error,
  onRetry,
  className = '',
}: ErrorStateProps) {
  const [showDetails, setShowDetails] = useState(false)
  const detailText = error instanceof Error ? error.message : typeof error === 'string' ? error : null

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-rose-500/20 bg-rose-500/[0.03] p-8 text-center backdrop-blur-xl ${className}`}
    >
      <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" />

      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-inner">
        <AlertTriangle className="h-7 w-7 stroke-[1.5]" />
      </div>

      <h3 className="mb-2 text-xl font-semibold tracking-tight text-white">{title}</h3>
      <p className="mb-6 max-w-md text-sm leading-6 text-white/60 mx-auto">{message}</p>

      {detailText ? (
        <div className="mb-6 mx-auto max-w-lg">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="inline-flex items-center gap-1.5 text-xs text-rose-300/80 hover:text-rose-200"
            type="button"
          >
            {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showDetails ? 'Hide technical error' : 'Show technical error'}
          </button>
          {showDetails ? (
            <pre className="mt-3 overflow-x-auto rounded-xl border border-rose-500/20 bg-black/60 p-3 text-left font-mono text-xs text-rose-300">
              {detailText}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry ? (
          <button
            onClick={onRetry}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-500 active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        ) : null}

        <Link
          to="/support"
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <HelpCircle className="h-4 w-4" />
          Contact Support
        </Link>
      </div>
    </div>
  )
}

// ─── 4. NO SEARCH RESULT STATE ───────────────────────────────────────────────
export interface NoSearchResultProps {
  searchQuery: string
  onClearSearch?: () => void
  className?: string
}

export function NoSearchResultState({
  searchQuery,
  onClearSearch,
  className = '',
}: NoSearchResultProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center backdrop-blur-xl sm:p-12 ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/50">
        <Search className="h-7 w-7 stroke-[1.5]" />
      </div>

      <h3 className="mb-2 text-xl font-semibold tracking-tight text-white">No results found</h3>
      <p className="mb-4 max-w-sm text-sm leading-6 text-white/60">
        We couldn't find anything matching{' '}
        <span className="inline-flex items-center rounded-md border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 font-mono text-xs font-medium text-violet-300">
          "{searchQuery}"
        </span>
      </p>

      {onClearSearch ? (
        <button
          onClick={onClearSearch}
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <XCircle className="h-4 w-4" />
          Clear search query
        </button>
      ) : null}
    </div>
  )
}

// ─── 5. PERMISSION DENIED (403) STATE ───────────────────────────────────────
export interface PermissionDeniedProps {
  title?: string
  description?: string
  backLink?: string
}

export function PermissionDeniedState({
  title = 'Access Restricted',
  description = 'You do not have administrative privileges to view this section or perform this operation.',
  backLink = '/home',
}: PermissionDeniedProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-xl">
        <ShieldAlert className="h-10 w-10 stroke-[1.5]" />
        <div className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 p-1 text-black">
          <Lock className="h-3.5 w-3.5" />
        </div>
      </div>

      <h1 className="mb-3 text-3xl font-semibold tracking-tight text-white">{title}</h1>
      <p className="mb-8 max-w-md text-sm leading-6 text-white/60">{description}</p>

      <div className="flex items-center gap-3">
        <Link
          to={backLink}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

// ─── 6. SUCCESS STATE ────────────────────────────────────────────────────────
export interface SuccessStateProps {
  title: string
  description: string
  details?: Array<{ label: string; value: string }>
  primaryActionLabel?: string
  onPrimaryAction?: () => void
  primaryActionLink?: string
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  secondaryActionLink?: string
  className?: string
}

export function SuccessState({
  title,
  description,
  details = [],
  primaryActionLabel,
  onPrimaryAction,
  primaryActionLink,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionLink,
  className = '',
}: SuccessStateProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.03] p-8 text-center backdrop-blur-xl sm:p-10 ${className}`}
    >
      <div className="pointer-events-none absolute -top-20 -left-20 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-inner">
        <CheckCircle2 className="h-9 w-9 stroke-[1.5]" />
      </div>

      <h3 className="mb-2 text-2xl font-semibold tracking-tight text-white">{title}</h3>
      <p className="mb-6 max-w-md text-sm leading-6 text-white/60 mx-auto">{description}</p>

      {details.length > 0 ? (
        <div className="mb-8 mx-auto max-w-md divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/40 p-4 text-left text-sm">
          {details.map((item, idx) => (
            <div className="flex justify-between py-2.5 first:pt-0 last:pb-0" key={idx}>
              <span className="text-white/50">{item.label}</span>
              <span className="font-medium text-white">{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {primaryActionLabel && primaryActionLink ? (
          <Link
            to={primaryActionLink}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            {primaryActionLabel}
          </Link>
        ) : primaryActionLabel && onPrimaryAction ? (
          <button
            onClick={onPrimaryAction}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            {primaryActionLabel}
          </button>
        ) : null}

        {secondaryActionLabel && secondaryActionLink ? (
          <Link
            to={secondaryActionLink}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {secondaryActionLabel}
          </Link>
        ) : secondaryActionLabel && onSecondaryAction ? (
          <button
            onClick={onSecondaryAction}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {secondaryActionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
