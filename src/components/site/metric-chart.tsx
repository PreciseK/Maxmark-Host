import type { AnalyticsSnapshot } from '@/lib/db/analytics'

interface MetricChartProps {
  /** Newest-first snapshots for a single metric. */
  snapshots: AnalyticsSnapshot[]
  loading: boolean
  barClassName: string
  height: string
  emptyLabel?: string
}

const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/**
 * Bar chart over real snapshots. Bars are scaled against the largest value in
 * the window, and the axis labels come from the snapshot timestamps, so an
 * empty series renders an empty state rather than an invented shape.
 */
export function MetricChart({
  snapshots,
  loading,
  barClassName,
  height,
  emptyLabel = 'No data has been recorded for this metric yet.',
}: MetricChartProps) {
  if (loading && snapshots.length === 0) {
    return (
      <div
        className={`${height} border-l border-b border-[#232328] flex items-center justify-center text-[10px] text-muted-foreground`}
      >
        Loading chart…
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div
        className={`${height} border-l border-b border-[#232328] flex items-center justify-center text-[10px] text-muted-foreground text-center px-4`}
      >
        {emptyLabel}
      </div>
    )
  }

  // Snapshots arrive newest-first; render oldest to newest, left to right.
  const series = [...snapshots].reverse()
  const max = Math.max(...series.map((s) => s.value))
  const peak = max > 0 ? max : 1

  const first = series[0]
  const last = series[series.length - 1]

  return (
    <>
      <div
        className={`${height} border-l border-b border-[#232328] relative flex items-end gap-1 px-3 pt-4 select-none`}
      >
        <div className="absolute left-[-30px] top-4 text-[9px] text-muted-foreground">
          {max.toLocaleString()}
        </div>
        <div className="absolute left-[-14px] bottom-1 text-[9px] text-muted-foreground">0</div>

        {series.map((snapshot) => (
          <div className="flex-1 flex flex-col justify-end h-full" key={snapshot.id}>
            <div
              className={`${barClassName} rounded-t-sm transition-all`}
              style={{ height: `${Math.max((snapshot.value / peak) * 100, 1)}%` }}
              title={`${snapshot.value.toLocaleString()} at ${timeFmt.format(new Date(snapshot.recordedAt))}`}
            ></div>
          </div>
        ))}
      </div>

      <div className="flex justify-between text-[8px] text-muted-foreground px-2">
        <span>{timeFmt.format(new Date(first.recordedAt))}</span>
        <span>{timeFmt.format(new Date(last.recordedAt))}</span>
      </div>
    </>
  )
}
