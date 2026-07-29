import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Shared building blocks for /admin pages, matching the dashboard's
// hand-rolled dark table styling (see support-page.tsx for the original).

export type BadgeTone = 'green' | 'amber' | 'red' | 'zinc' | 'violet' | 'sky'

const toneClasses: Record<BadgeTone, string> = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  red: 'border-red-500/30 bg-red-500/10 text-red-400',
  zinc: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  violet: 'border-[#5c4df0]/40 bg-[#5c4df0]/10 text-[#a89cf7]',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
}

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-block border px-2 py-0.5 rounded-full text-[10px] font-semibold',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  )
}

interface AdminPageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  )
}

interface TableCardProps {
  title: string
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export function TableCard({ title, actions, footer, children }: TableCardProps) {
  return (
    <div className="bg-[#161619] border border-[#232328] rounded-lg overflow-hidden flex flex-col justify-between">
      <div>
        <div className="px-5 py-4 border-b border-[#232328] flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {actions}
        </div>
        <div className="overflow-x-auto">{children}</div>
      </div>
      {footer !== undefined ? (
        <div className="px-5 py-4 border-t border-[#232328] bg-[#121214] flex items-center justify-between text-xs text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td className="px-5 py-8 text-center text-muted-foreground" colSpan={colSpan}>
        {message}
      </td>
    </tr>
  )
}

export function DemoNotice() {
  return (
    <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
      Demo mode — this change is applied locally only. Connect Supabase to persist admin
      actions.
    </p>
  )
}

// Class recipes shared by admin tables, forms, and dialogs.
export const tableClass = 'w-full text-left border-collapse'
export const theadRowClass =
  'border-b border-[#232328] text-xs text-muted-foreground bg-[#121214]'
export const thClass = 'px-5 py-3 font-semibold'
export const tbodyClass = 'divide-y divide-[#232328] text-xs text-white'
export const rowClass = 'hover:bg-[#1c1c20] transition'
export const cellClass = 'px-5 py-4'

export const primaryButtonClass =
  'flex items-center gap-1.5 px-4 py-2 bg-[#5c4df0] hover:bg-[#4d3fe0] rounded-md text-xs font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed'
export const secondaryButtonClass =
  'px-4 py-2 bg-[#202024] hover:bg-[#2c2c32] rounded-md text-xs font-semibold border border-[#2d2d34] transition text-white disabled:opacity-50 disabled:cursor-not-allowed'
export const dangerButtonClass =
  'px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-md text-xs font-semibold border border-red-500/30 text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed'

export const fieldLabelClass =
  'block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5'
export const fieldInputClass =
  'w-full bg-[#1c1c1f] border border-[#2d2d34] rounded-md px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-[#5c4df0]/50 transition-colors'

// Dark override for the light-styled Radix dialog in components/ui/dialog.tsx.
export const adminDialogClass =
  'rounded-xl border border-[#2d2d34] bg-[#161618] p-6 shadow-2xl w-[min(94vw,520px)] text-white'
