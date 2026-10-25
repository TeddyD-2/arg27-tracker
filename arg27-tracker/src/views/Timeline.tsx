import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { healthOf, isDone, statusOf } from '../lib/derive'
import {
  addDays,
  daysBetween,
  fmtDayYear,
  fmtMonth,
  monthsBetween,
  parseDay,
  relativeDays,
  toISO,
  today,
} from '../lib/dates'
import {
  groupCode,
  GROUP_LABEL,
  groupOf,
  STATUS_COLOR,
  type Milestone,
  type Task,
} from '../lib/types'
import { Button, Card, ChartTooltip, cx, EmptyState, Select, StatusChip } from '../components/ui'
import { IconChevron } from '../components/icons'
import type { DrawerTarget } from '../components/ItemDrawer'
import { buildLanes, LABEL_MIN_PX_PER_DAY, MS_LANE, MS_STRIP, ROW_H } from '../lib/lanes'
import { useLaneOrder } from '../lib/laneOrder'
import { TimelinePrint } from '../components/TimelinePrint'

const LABEL_W = 168

type Zoom = 'month' | 'quarter' | 'half' | 'season' | 'all'

/**
 * Window and density for each zoom. `from`/`to` are day offsets from today;
 * the season and full-extent windows come from the data instead, so they carry
 * no offsets. Denser windows get more pixels per day.
 */
const ZOOMS: {
  value: Zoom
  label: string
  from?: number
  to?: number
  px: number
}[] = [
  { value: 'month', label: '30 days', from: -7, to: 30, px: 24 },
  { value: 'quarter', label: '90 days', from: -21, to: 90, px: 9 },
  { value: 'half', label: '6 months', from: -30, to: 182, px: 5 },
  { value: 'season', label: 'Season', px: 3.4 },
  { value: 'all', label: 'Everything', px: 2.6 },
]
const ZOOM_BY_VALUE = Object.fromEntries(ZOOMS.map((z) => [z.value, z])) as Record<
  Zoom,
  (typeof ZOOMS)[number]
>

/** The schedule card on the Overview. It has no page of its own. */
export function Timeline({ onOpenItem }: { onOpenItem: (t: DrawerTarget) => void }) {
  const { ds, subteam } = useStore()
  const laneOrder = useLaneOrder(subteam)
  const now = today()
  const [zoom, setZoom] = useState<Zoom>('season')
  const [assembly, setAssembly] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [hover, setHover] = useState<{
    x: number
    y: number
    node: React.ReactNode
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const dated = useMemo(() => {
    const tasks = ds.tasks.filter(
      (t) => t.due && (!assembly || groupOf(ds, t) === assembly) && (!hideDone || !isDone(t)),
    )
    // Filtering to one assembly narrows the milestone strip to the deadlines
    // that assembly's work actually feeds.
    const linked = new Set(tasks.map((t) => t.milestoneId).filter(Boolean))
    return {
      tasks,
      milestones: ds.milestones.filter(
        (m) => m.due && (!assembly || linked.has(m.id)) && (!hideDone || !isDone(m)),
      ),
    }
  }, [ds, assembly, hideDone])

  const range = useMemo(() => {
    const all = [
      ...dated.tasks.flatMap((t) => [t.start, t.due]),
      ...dated.milestones.map((m) => m.due),
    ].filter(Boolean) as string[]
    if (!all.length) return null
    const min = parseDay(all.reduce((a, b) => (a < b ? a : b)))!
    const max = parseDay(all.reduce((a, b) => (a > b ? a : b)))!
    if (zoom === 'all') return { from: addDays(min, -10), to: addDays(max, 10) }
    const z = ZOOM_BY_VALUE[zoom]
    if (z.from !== undefined && z.to !== undefined)
      return { from: addDays(now, z.from), to: addDays(now, z.to) }
    // "Season" is the declared ARG27 window, not the data extent — a couple of
    // stray dates in the sheet would otherwise stretch it to uselessness.
    const from = parseDay(ds.meta.seasonStart) ?? min
    const to = parseDay(ds.meta.seasonEnd) ?? max
    return { from: addDays(from, -7), to: addDays(to, 21) }
  }, [dated, zoom, now, ds.meta])

  /** Dated work that falls outside the visible window, so nothing goes missing silently. */
  const offscreen = useMemo(() => {
    if (!range) return 0
    const inRange = (iso: string) => {
      const d = parseDay(iso)
      return d && d >= range.from && d <= range.to
    }
    return (
      dated.tasks.filter((t) => !inRange(t.due)).length +
      dated.milestones.filter((m) => !inRange(m.due)).length
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dated, range?.from, range?.to])

  const assemblies = useMemo(
    () => [...new Set(ds.tasks.map((t) => groupOf(ds, t)).filter(Boolean))].sort(),
    [ds],
  )

  const totalDays = range ? Math.max(1, daysBetween(range.from, range.to)) : 1
  const pxPerDay = ZOOM_BY_VALUE[zoom].px
  // Zoomed in far enough that a title next to each bar still reads cleanly.
  const showLabels = pxPerDay >= LABEL_MIN_PX_PER_DAY
  const chartW = Math.max(720, totalDays * pxPerDay)
  const xOf = (iso: string) =>
    range ? (daysBetween(range.from, parseDay(iso)!) / totalDays) * chartW : 0

  const lanes = useMemo(
    () =>
      range
        ? buildLanes({
            tasks: dated.tasks,
            milestones: dated.milestones,
            range,
            chartW,
            totalDays,
            showLabels,
            groupOf: (t) => groupOf(ds, t),
            order: laneOrder.order,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dated, ds, chartW, range?.from, range?.to, totalDays, showLabels, laneOrder.order],
  )

  /**
   * Pinch (which a trackpad reports as ctrl+wheel) and ctrl/⌘+wheel step through
   * the zoom levels, keeping whatever date is under the cursor pinned in place.
   * A plain wheel is deliberately left alone: with a dozen lanes in the
   * full-team view the chart has to scroll vertically like anything else.
   */
  const anchor = useRef<{ iso: string; offset: number } | null>(null)
  const lastZoomAt = useRef(0)
  const wheelAccum = useRef(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !range) return

    /** Step `dir` levels, remembering the date under `clientX` to re-centre on. */
    const stepZoom = (dir: number, clientX: number) => {
      const i = ZOOMS.findIndex((z) => z.value === zoom)
      const next = i + dir
      if (next < 0 || next >= ZOOMS.length) return false
      if (Date.now() - lastZoomAt.current < 200) return true
      lastZoomAt.current = Date.now()
      // The scroller starts at the sticky gutter, so shift into chart space.
      const offset = clientX - el.getBoundingClientRect().left - LABEL_W
      const day = ((el.scrollLeft + offset) / chartW) * totalDays
      anchor.current = {
        iso: toISO(addDays(range.from, Math.round(day))),
        offset,
      }
      setZoom(ZOOMS[next].value)
      return true
    }

    const onWheel = (e: WheelEvent) => {
      // Only a pinch gesture zooms. Everything else scrolls the chart.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      // A pinch arrives as a stream of small deltas; accumulate to one step.
      wheelAccum.current += e.deltaY
      if (Math.abs(wheelAccum.current) < 24) return
      const dir = wheelAccum.current > 0 ? 1 : -1
      wheelAccum.current = 0
      stepZoom(dir, e.clientX)
    }

    // Touchscreen pinch, which produces no wheel event at all.
    let pinch: { dist: number; x: number } | null = null
    const spread = (t: TouchList) => {
      const [a, b] = [t[0], t[1]]
      return {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2,
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = spread(e.touches)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return
      const now = spread(e.touches)
      const ratio = now.dist / pinch.dist
      if (ratio > 1.3 || ratio < 0.77) {
        e.preventDefault()
        stepZoom(ratio > 1 ? -1 : 1, now.x)
        pinch = now
      }
    }
    const onTouchEnd = () => {
      pinch = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [zoom, chartW, totalDays, range])

  // Re-scroll to the anchor date once the new zoom has been laid out.
  useEffect(() => {
    const el = scrollRef.current
    const a = anchor.current
    if (!el || !a || !range) return
    anchor.current = null
    const d = parseDay(a.iso)
    if (d) el.scrollLeft = Math.max(0, (daysBetween(range.from, d) / totalDays) * chartW - a.offset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, chartW, totalDays, range?.from])

  if (!range) {
    return (
      <Card title="Timeline">
        <EmptyState
          title="Nothing to plot"
          hint="Timeline rows come from items with dates. Add due dates on the Tasks or Milestones views."
        />
      </Card>
    )
  }

  const months = monthsBetween(range.from, range.to)
  const todayX = now >= range.from && now <= range.to ? xOf(toISO(now)) : null
  const compX = (() => {
    const c = parseDay(ds.meta.competition)
    return c && c >= range.from && c <= range.to ? xOf(ds.meta.competition) : null
  })()

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={assembly}
        onChange={(e) => setAssembly(e.target.value)}
        placeholder={GROUP_LABEL[ds.groupBy].all}
        options={assemblies.map((a) => ({
          value: a,
          label: `${groupCode(ds, a)} · ${a}`,
        }))}
      />
      <Select
        value={zoom}
        onChange={(e) => setZoom(e.target.value as Zoom)}
        options={ZOOMS.map((z) => ({ value: z.value, label: z.label }))}
      />
      <Select
        value={hideDone ? 'open' : 'all'}
        onChange={(e) => setHideDone(e.target.value === 'open')}
        options={[
          { value: 'all', label: 'All work' },
          { value: 'open', label: 'Hide complete' },
        ]}
      />
      <Button
        onClick={() => {
          const el = scrollRef.current
          if (el && todayX !== null)
            el.scrollTo({
              left: Math.max(0, todayX - 240),
              behavior: 'smooth',
            })
        }}
      >
        Today
      </Button>
      <Button onClick={() => setPrinting(true)} title="Open a large, printable version">
        Print
      </Button>
      {laneOrder.custom && (
        <Button
          variant="subtle"
          onClick={laneOrder.reset}
          title="Sort the lanes by how much work they carry again"
        >
          Reset order
        </Button>
      )}
    </div>
  )

  return (
    // h-full so the card matches the height of the one beside it on the Overview.
    <div className="h-full">
      <Card
        pad={false}
        className="flex h-full flex-col overflow-hidden"
        bodyClassName="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-2">
          <h2 className="text-[15px] font-semibold text-ink">Timeline</h2>
          {controls}
        </div>
        {/* One scroller for both axes. Nesting a horizontal one inside a
            vertical one gave the card two vertical scrollbars, because
            `overflow-x: auto` forces `overflow-y` to auto as well. The label
            gutter and the month scale stay put with `position: sticky`. */}
        <div ref={scrollRef} className="flex max-h-[560px] min-h-0 flex-1 overflow-auto">
          {/* Lane labels stay readable while the chart scrolls sideways. */}
          <div
            className="sticky left-0 z-20 shrink-0 border-r border-hairline bg-surface"
            style={{ width: LABEL_W }}
          >
            <div className="sticky top-0 z-10 h-9 border-b border-hairline bg-surface" />
            {lanes.map((lane) => (
              <div
                key={lane.name}
                className="group flex items-start gap-1 border-b border-hairline px-3 pt-1.5"
                style={{ height: lane.height }}
              >
                {/* Plain text, not a chip — a boxed label inside a boxed lane
                    inside a boxed card reads as noise, and the name gets clipped. */}
                <div className="min-w-0 flex-1">
                  <div className="tnum text-[10px] text-muted">
                    {lane.name === MS_LANE
                      ? `${lane.milestones.length} deadlines`
                      : `${groupCode(ds, lane.name)} · ${lane.bars.length} tasks`}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-tight font-medium text-ink">
                    {lane.name}
                  </div>
                </div>
                {/* The deadline strip is not one of the work lanes, so it has
                    nowhere to move to and keeps the top. */}
                {lane.name !== MS_LANE && (
                  <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Nudge lane={lane.name} dir={-1} />
                    <Nudge lane={lane.name} dir={1} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* z-0 keeps the today and competition rules from painting over the
              sticky gutter beside them. */}
          <div className="relative z-0 shrink-0" style={{ width: chartW }}>
            {/* month scale */}
            <div className="sticky top-0 z-10 h-9 border-b border-hairline bg-surface">
              {months.map((m) => {
                const x = (daysBetween(range.from, m) / totalDays) * chartW
                if (x < -40) return null
                return (
                  <div key={+m} className="absolute top-0 h-9" style={{ left: x }}>
                    <div className="h-full w-px bg-hairline" />
                    <span className="absolute top-2 left-1.5 text-[10px] whitespace-nowrap text-muted">
                      {fmtMonth(m)}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="relative">
              {/* month gridlines behind the bars */}
              {months.map((m) => {
                const x = (daysBetween(range.from, m) / totalDays) * chartW
                return (
                  <div
                    key={`g${+m}`}
                    className="absolute top-0 bottom-0 w-px bg-hairline/60"
                    style={{ left: x }}
                  />
                )
              })}

              {todayX !== null && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-brand"
                  style={{ left: todayX }}
                >
                  <span className="absolute -top-0 left-1 rounded bg-brand px-1 py-px text-[9px] font-semibold text-white">
                    TODAY
                  </span>
                </div>
              )}
              {compX !== null && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-20 w-px"
                  style={{
                    left: compX,
                    background:
                      'repeating-linear-gradient(to bottom,#f4f6f8 0 4px,transparent 4px 8px)',
                  }}
                >
                  <span className="absolute top-0 left-1 rounded bg-ink px-1 py-px text-[9px] font-semibold text-plane">
                    COMP
                  </span>
                </div>
              )}

              {lanes.map((lane) => (
                <div
                  key={lane.name}
                  className="relative border-b border-hairline"
                  style={{ height: lane.height }}
                >
                  {lane.bars.map(({ item, x, w, y, labelW, flip }) => {
                    const s = statusOf(item)
                    const overdue = healthOf(item, now).band === 'overdue' && !isDone(item)
                    return (
                      <button
                        key={item.id}
                        onClick={() => onOpenItem({ kind: 'task', id: item.id })}
                        onMouseMove={(e) =>
                          setHover({
                            x: e.clientX,
                            y: e.clientY,
                            node: <BarTip item={item} />,
                          })
                        }
                        onMouseLeave={() => setHover(null)}
                        // The caption is inside the button, so a 6px bar still
                        // has a comfortable click and hover target.
                        // Captions that would run past the right edge flip to
                        // the left of their bar; the packer reserves the space
                        // on that side so nothing collides.
                        className={cx(
                          'group absolute flex items-center gap-1.5',
                          flip && 'flex-row-reverse',
                        )}
                        style={{
                          ...(flip ? { left: x - (labelW ? labelW + 8 : 0) } : { left: x }),
                          top: y + MS_STRIP,
                          width: w + (labelW ? labelW + 8 : 0),
                          height: ROW_H - 6,
                        }}
                        aria-label={`${item.id} ${item.title}`}
                      >
                        <span
                          className="h-full shrink-0 rounded-[3px] transition-[filter] group-hover:brightness-125"
                          style={{
                            width: w,
                            background: STATUS_COLOR[s],
                            // 2px surface ring keeps abutting bars visually separate
                            boxShadow: overdue
                              ? '0 0 0 1.5px #d03b3b, 0 0 0 3px #14171c'
                              : '0 0 0 2px #14171c',
                          }}
                        />
                        {labelW > 0 && (
                          <span
                            className="truncate text-[10px] leading-none text-ink-2 group-hover:text-ink"
                            style={{ maxWidth: labelW }}
                          >
                            {item.title}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {lane.milestones.map((m) => {
                    const x = xOf(m.due)
                    const overdue = healthOf(m, now).band === 'overdue' && !isDone(m)
                    return (
                      <button
                        key={m.id}
                        onClick={() => onOpenItem({ kind: 'milestone', id: m.id })}
                        onMouseMove={(e) =>
                          setHover({
                            x: e.clientX,
                            y: e.clientY,
                            node: <MsTip m={m} />,
                          })
                        }
                        onMouseLeave={() => setHover(null)}
                        className="absolute z-10 flex items-center justify-center"
                        style={{ left: x - 8, top: 2, width: 16, height: 16 }}
                        aria-label={`Milestone ${m.id} ${m.title}`}
                      >
                        <span
                          className="block size-2.5 rotate-45 transition-transform hover:scale-125"
                          style={{
                            background: STATUS_COLOR[statusOf(m)],
                            boxShadow: overdue
                              ? '0 0 0 1.5px #d03b3b, 0 0 0 3px #14171c'
                              : '0 0 0 2px #14171c',
                          }}
                        />
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* One footer under the chart: what the marks mean, then what is in it. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-[2px] bg-st-progress" />
              <span className="text-ink-2">Task</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rotate-45 bg-ink-2" />
              <span className="text-ink-2">Milestone</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-0.5 bg-brand" />
              <span className="text-ink-2">Today</span>
            </span>
          </div>
          <span className="text-[11px] text-muted">Pinch to zoom</span>
          <span className="tnum ml-auto text-[11px] text-muted">
            {dated.tasks.length} dated · {dated.milestones.length} milestones ·{' '}
            {ds.tasks.length - dated.tasks.length} undated
            {offscreen > 0 && (
              <span className="ml-2 text-warn">{offscreen} outside this window</span>
            )}
          </span>
        </div>
      </Card>

      {printing && (
        <TimelinePrint
          tasks={dated.tasks}
          milestones={dated.milestones}
          range={range}
          onClose={() => setPrinting(false)}
        />
      )}

      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          {hover.node}
        </ChartTooltip>
      )}
    </div>
  )

  /**
   * One nudge of a lane's place in the chart. Hidden until the lane is
   * hovered or the button is tabbed to, so thirteen lanes do not come with
   * twenty-six arrows on screen at rest.
   */
  function Nudge({ lane, dir }: { lane: string; dir: -1 | 1 }) {
    const names = lanes.filter((l) => l.name !== MS_LANE).map((l) => l.name)
    const at = names.indexOf(lane)
    const end = dir === -1 ? at <= 0 : at === names.length - 1
    return (
      <button
        type="button"
        disabled={end}
        onClick={() => laneOrder.move(names, lane, dir)}
        className="flex size-4 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-20 disabled:hover:bg-transparent"
        title={`Move ${lane} ${dir === -1 ? 'up' : 'down'}`}
        aria-label={`Move ${lane} ${dir === -1 ? 'up' : 'down'}`}
      >
        <IconChevron className={cx('size-3', dir === -1 ? '-rotate-90' : 'rotate-90')} />
      </button>
    )
  }

  function BarTip({ item }: { item: Task }) {
    return (
      <>
        <div className="mb-1 flex items-center gap-2">
          <span className="tnum text-[10px] font-semibold text-muted">{item.id}</span>
          <StatusChip status={item.status} size="xs" />
        </div>
        <div className="max-w-[240px] text-[13px] text-ink">{item.title}</div>
        <div className="mt-1 text-[11px] text-muted">
          {item.start ? `${fmtDayYear(item.start)} → ` : 'Due '}
          {fmtDayYear(item.due)} · {relativeDays(item.due, now)}
        </div>
        {item.owners.length > 0 && (
          <div className="mt-0.5 text-[11px] text-ink-2">{item.owners.join(', ')}</div>
        )}
      </>
    )
  }

  function MsTip({ m }: { m: Milestone }) {
    const supporting = ds.tasks.filter((t) => t.milestoneId === m.id)
    return (
      <>
        <div className="mb-1 flex items-center gap-2">
          <span className="tnum text-[10px] font-semibold text-brand">MILESTONE {m.id}</span>
          <StatusChip status={m.status} size="xs" />
        </div>
        <div className="max-w-[240px] text-[13px] text-ink">{m.title}</div>
        <div className="mt-1 text-[11px] text-muted">
          {fmtDayYear(m.due)} · {relativeDays(m.due, now)}
        </div>
        {supporting.length > 0 && (
          <div className="mt-0.5 text-[11px] text-ink-2">{supporting.length} supporting tasks</div>
        )}
      </>
    )
  }
}
