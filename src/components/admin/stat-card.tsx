import type { ReactNode } from 'react'

import { Sparkline } from '@/components/admin/sparkline'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: number[]
  icon?: ReactNode
}

export function StatCard({ label, value, sub, trend, icon }: StatCardProps) {
  return (
    <div className="bg-[#161618] border border-[#232328] rounded-lg p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        {icon}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-white leading-none">{value}</p>
          {sub ? <p className="text-xs text-muted-foreground mt-1.5">{sub}</p> : null}
        </div>
        {trend ? <Sparkline data={trend} /> : null}
      </div>
    </div>
  )
}
