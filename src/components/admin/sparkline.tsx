interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  stroke?: string
}

/** Minimal SVG trend line — deliberately hand-rolled; no charts dependency. */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = '#5c4df0',
}: SparklineProps) {
  if (data.length < 2) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)

  const points = data
    .map((value, index) => {
      const x = index * stepX
      const y = height - ((value - min) / range) * (height - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <polyline
        points={points}
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}
