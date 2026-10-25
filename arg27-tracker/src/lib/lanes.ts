import { daysBetween, parseDay } from './dates'
import type { Milestone, Task } from './types'

/**
 * Gantt layout, shared by the Timeline card and its print sheet so both lay out
 * identically — the print sheet is the same chart at a larger scale, not a
 * second implementation that can drift.
 */

export const ROW_H = 22
export const LANE_PAD = 8
/** Milestones get their own strip at the top of each lane so they never sit on a bar. */
export const MS_STRIP = 20
/** Tall enough for the two-line group label in the gutter. */
export const MIN_LANE_H = 56
/** Milestones belong to the subteam, not to one assembly, so they share a lane. */
export const MS_LANE = 'Milestones'

/** Below this density a title would be wider than the time it describes. */
export const LABEL_MIN_PX_PER_DAY = 8
/** Fallback label width when text cannot be measured (no canvas). */
export const labelWidth = (title: string, charW = 5.4, max = 200) =>
  Math.min(max, title.length * charW + 8)

/**
 * Real text metrics for the font the captions are actually set in.
 *
 * Estimating width as characters x a constant was never going to hold: the
 * estimate was also capped, so a long title reserved 280px and then rendered
 * 354px wide, running straight over its neighbour. Measuring removes the guess,
 * and with no cap the packer waterfalls a long title onto its own row instead.
 */
export function textMeasurer(font: string): (title: string) => number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return (title) => labelWidth(title)
  ctx.font = font
  const cache = new Map<string, number>()
  return (title) => {
    let w = cache.get(title)
    if (w === undefined) {
      w = ctx.measureText(title).width
      cache.set(title, w)
    }
    return w
  }
}

export interface Bar {
  item: Task
  x: number
  w: number
  y: number
  /** 0 when the scale is too coarse to caption the bars. */
  labelW: number
  /** Caption sits left of the bar because it would otherwise run off the edge. */
  flip: boolean
}

/**
 * Where a captioned mark actually sits, mark plus caption. A flipped caption
 * extends leftwards, so the interval starts before the mark — packing has to
 * reserve that, or the flipped label lands on whatever is already there.
 */
export function span(x: number, w: number, labelW: number, chartW: number, gap = 8) {
  const flip = labelW > 0 && x + w + gap + labelW > chartW
  const left = flip ? Math.max(0, x - gap - labelW) : x
  const right = flip ? x + w : x + w + (labelW ? gap + labelW : 6)
  return { flip, left, right }
}

export interface Lane {
  name: string
  bars: Bar[]
  milestones: Milestone[]
  height: number
}

export interface LaneInput {
  tasks: Task[]
  milestones: Milestone[]
  range: { from: Date; to: Date }
  chartW: number
  totalDays: number
  showLabels: boolean
  /** The lane a task belongs to — its assembly, or its subteam across the program. */
  groupOf: (t: Task) => string
  /** Hand-picked lane order, most-wanted first. Lanes it does not name keep
   *  their largest-first place after the ones it does. */
  order?: string[]
  /** Row height, so the print sheet can give each bar more air. */
  rowH?: number
  /** Caption metrics, so a larger type size still reserves enough room. */
  charW?: number
  maxLabelW?: number
  /** Measures a caption in the font it will be drawn in. Preferred over the
   *  charW estimate — see textMeasurer. */
  measure?: (title: string) => number
}

export function buildLanes({
  tasks,
  milestones,
  range,
  chartW,
  totalDays,
  showLabels,
  groupOf,
  order,
  rowH = ROW_H,
  charW,
  maxLabelW,
  measure,
}: LaneInput): Lane[] {
  const xOf = (iso: string) => (daysBetween(range.from, parseDay(iso)!) / totalDays) * chartW
  const visible = (iso: string) => {
    const d = parseDay(iso)
    return !!d && d >= range.from && d <= range.to
  }
  const inWindow = {
    tasks: tasks.filter((t) => visible(t.due) || visible(t.start || t.due)),
    milestones: milestones.filter((m) => visible(m.due)),
  }

  const names = [...new Set(inWindow.tasks.map((t) => groupOf(t) || 'Unassigned'))]
  const work = names
    .map((name) => {
      const mine = inWindow.tasks.filter((t) => (groupOf(t) || 'Unassigned') === name)
      const rows: { end: number }[] = []
      const bars: Bar[] = []
      for (const t of [...mine].sort((a, b) =>
        (a.start || a.due).localeCompare(b.start || b.due),
      )) {
        const x = xOf(t.start || t.due)
        const w = Math.max(6, xOf(t.due) - x)
        // Most tasks on the sheet carry only a due date, so their bars are the
        // 6px minimum. The caption therefore sits beside the bar, and the row
        // packing reserves its width so captions never overlap the next bar.
        const labelW = !showLabels
          ? 0
          : measure
            ? measure(t.title) + 4
            : labelWidth(t.title, charW, maxLabelW)
        const { flip, left, right } = span(x, w, labelW, chartW)
        let row = rows.findIndex((r) => r.end <= left)
        if (row === -1) {
          rows.push({ end: right })
          row = rows.length - 1
        } else rows[row].end = Math.max(rows[row].end, right)
        bars.push({ item: t, x, w, y: row * rowH, labelW, flip })
      }
      return {
        name,
        bars,
        milestones: [] as Milestone[],
        height: Math.max(MIN_LANE_H, MS_STRIP + Math.max(1, rows.length) * rowH + LANE_PAD),
      }
    })
    .sort((a, b) => b.bars.length - a.bars.length)

  // A hand-picked order wins over size, for the lanes it names. Sorting is
  // stable, so the rest stay largest-first underneath them.
  if (order?.length) {
    const rank = (name: string) => {
      const i = order.indexOf(name)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    work.sort((a, b) => rank(a.name) - rank(b.name))
  }

  return inWindow.milestones.length
    ? [
        {
          name: MS_LANE,
          bars: [],
          milestones: inWindow.milestones,
          height: MIN_LANE_H,
        },
        ...work,
      ]
    : work
}
