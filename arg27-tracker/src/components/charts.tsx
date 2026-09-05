import { useMemo, useState } from 'react'
import { STATUS_COLOR, STATUS_STACK_ORDER, type Status } from '../lib/types'
import { ChartTooltip, cx, Dot } from './ui'

/* ------------------------------------------------------- status stacked bar */

export interface StatusCounts {
  counts: Partial<Record<Status, number>>
  total: number
}

export function countStatuses(items: { status: Status | '' }[]): StatusCounts {
  const counts: Partial<Record<Status, number>> = {}
  for (const i of items) {
    const s = (i.status || 'Not Started') as Status
    counts[s] = (counts[s] ?? 0) + 1
  }
  return { counts, total: items.length }
}

/**
 * One-row stacked bar of work states. Segments follow STATUS_STACK_ORDER so
 * Blocked (red) never touches Complete (green); a 2px surface gap separates
 * every fill, and the legend below carries the labels.
 */
export function StatusStack({
  items,
  height = 10,
  onSelect,
  active,
}: {
  items: { status: Status | '' }[]
  height?: number
  onSelect?: (s: Status) => void
  active?: Status | null
}) {
  const [hover, setHover] = useState<{ s: Status; x: number; y: number } | null>(null)
  const { counts, total } = useMemo(() => countStatuses(items), [items])
  if (!total) return <div className="rounded-full bg-surface-3" style={{ height }} />

  const segments = STATUS_STACK_ORDER.filter((s) => (counts[s] ?? 0) > 0)

  return (
    <>
      <div className="flex w-full gap-[2px]" style={{ height }} role="img" aria-label="Work by status">
        {segments.map((s) => {
          const n = counts[s]!
          return (
            <button
              key={s}
              onClick={onSelect ? () => onSelect(s) : undefined}
              onMouseMove={(e) => setHover({ s, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
              aria-label={`${s}: ${n}`}
              className={cx(
                'h-full rounded-[3px] transition-opacity first:rounded-l-full last:rounded-r-full',
                onSelect && 'cursor-pointer',
                active && active !== s ? 'opacity-30' : 'opacity-100',
              )}
              style={{ width: `${(n / total) * 100}%`, background: STATUS_COLOR[s], minWidth: 3 }}
            />
          )
        })}
      </div>
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          <div className="flex items-center gap-2">
            <Dot color={STATUS_COLOR[hover.s]} />
            <span className="text-ink">{hover.s}</span>
            <span className="tnum ml-auto pl-3 font-semibold text-ink">{counts[hover.s]}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {Math.round(((counts[hover.s] ?? 0) / total) * 100)}% of {total}
          </div>
        </ChartTooltip>
      )}
    </>
  )
}

export function StatusLegend({
  items,
  onSelect,
  active,
}: {
  items: { status: Status | '' }[]
  onSelect?: (s: Status) => void
  active?: Status | null
}) {
  const { counts } = useMemo(() => countStatuses(items), [items])
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {STATUS_STACK_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
        <li key={s}>
          <button
            onClick={onSelect ? () => onSelect(s) : undefined}
            className={cx(
              'flex items-center gap-1.5 text-[11px] transition-opacity',
              onSelect && 'cursor-pointer hover:opacity-100',
              active && active !== s ? 'opacity-40' : '',
            )}
          >
            <Dot color={STATUS_COLOR[s]} />
            <span className="text-ink-2">{s}</span>
            <span className="tnum font-semibold text-ink">{counts[s]}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* --------------------------------------------------------------- stat tile */

export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  onClick,
}: {
  label: string
  value: string | number
  unit?: string
  hint?: React.ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'danger'
  onClick?: () => void
}) {
  const tones = {
    neutral: 'text-ink',
    good: 'text-st-done',
    warn: 'text-warn',
    danger: 'text-st-blocked',
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'rounded-xl border border-hairline bg-surface px-4 py-3.5 text-left transition-colors',
        onClick && 'hover:border-surface-3 hover:bg-surface-2',
      )}
    >
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cx('text-[27px] leading-none font-semibold tracking-tight', tones[tone])}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-muted">{hint}</div>}
    </Tag>
  )
}
