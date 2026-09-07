import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../lib/store'
import { healthOf, isDone, statusOf } from '../lib/derive'
import { daysBetween, fmtDayYear, fmtMonth, monthsBetween, parseDay, toISO, today } from '../lib/dates'
import {
  groupCode,
  groupOf,
  PRIORITY_COLOR,
  STATUS_COLOR,
  type Milestone,
  type Priority,
  type Task,
} from '../lib/types'
import { buildLanes, labelWidth, MS_LANE, MS_STRIP, span } from '../lib/lanes'
import { Button, Select } from './ui'
import { IconClose } from './icons'

/**
 * The Timeline card at poster size, for printing or dropping into a deck.
 *
 * Same layout function as the card — this is the chart enlarged, not a second
 * implementation — but with taller rows, every bar captioned, and a light sheet,
 * because a dark background wastes ink and reads badly under a projector.
 */

const PAD = 32
const LABEL_W = 190
const ROW_H = 30
const LANE_MIN = 66

/** Roughly the advance width of the 13px caption face. */
const CHAR_W = 6.8

type Ratio = 'letter' | 'slide169' | 'slide43' | 'portrait'

/**
 * Page shapes. `h` fixes the canvas so the sheet really is that ratio — a deck
 * needs its slide to be 16:9 whatever the content does — and the chart is
 * scaled down to fit rather than spilling off the bottom. `h: 0` lets the sheet
 * grow to its content, which is what you want on paper.
 */
const RATIOS: { value: Ratio; label: string; w: number; h: number; page: string }[] = [
  { value: 'letter', label: 'Paper · landscape', w: 1040, h: 0, page: 'landscape' },
  { value: 'slide169', label: 'Slide · 16:9', w: 1280, h: 720, page: 'landscape' },
  { value: 'slide43', label: 'Slide · 4:3', w: 1024, h: 768, page: 'landscape' },
  { value: 'portrait', label: 'Paper · portrait', w: 800, h: 0, page: 'portrait' },
]

type Ink = 'status' | 'priority' | 'group' | 'mono'

const INKS: { value: Ink; label: string }[] = [
  { value: 'status', label: 'Colour: status' },
  { value: 'priority', label: 'Colour: priority' },
  { value: 'group', label: 'Colour: lane' },
  { value: 'mono', label: 'Mono (ink saving)' },
]

/** A calm categorical ramp for lanes — distinguishable, and legible on white. */
const LANE_INK = ['#2f6fb5', '#0f8a6a', '#b3591b', '#7a4fb5', '#a8323f', '#3d7a2f', '#8a6d1f']

export function TimelinePrint({
  tasks,
  milestones,
  range,
  onClose,
}: {
  tasks: Task[]
  milestones: Milestone[]
  range: { from: Date; to: Date }
  onClose: () => void
}) {
  const { ds, subteam, isAllTeams } = useStore()
  const [ink, setInk] = useState<Ink>('status')
  const [ratio, setRatio] = useState<Ratio>('letter')
  const now = today()

  const shape = RATIOS.find((r) => r.value === ratio)!
  const contentW = shape.w - PAD * 2
  const totalDays = Math.max(1, daysBetween(range.from, range.to))
  const chartW = contentW - LABEL_W
  const xOf = (iso: string) => (daysBetween(range.from, parseDay(iso)!) / totalDays) * chartW

  const lanes = useMemo(
    () =>
      buildLanes({
        tasks,
        milestones,
        range,
        chartW,
        totalDays,
        showLabels: true,
        groupOf: (t) => groupOf(ds, t),
        rowH: ROW_H,
        // 13px captions here, against 10px on the card.
        charW: CHAR_W,
        maxLabelW: 280,
      }),
    [tasks, milestones, range, chartW, totalDays, ds],
  )

  /**
   * The milestone strip is one row on screen because the diamonds are unlabelled
   * there. Here every milestone carries its name, so they have to be packed onto
   * rows as well or the titles sit on top of one another.
   */
  const msRows = useMemo(() => {
    const strip = lanes.find((l) => l.name === MS_LANE)
    if (!strip)
      return { rows: [] as { m: Milestone; x: number; y: number; flip: boolean }[], height: 0 }
    const ends: number[] = []
    const rows = [...strip.milestones]
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((m) => {
        const x = xOf(m.due) - 6
        const labelW = labelWidth(m.title, CHAR_W, 280)
        // The diamond is 12px wide; the caption sits beside it.
        const { flip, left, right } = span(x, 12, labelW, chartW, 6)
        let row = ends.findIndex((end) => end <= left)
        if (row === -1) {
          ends.push(right)
          row = ends.length - 1
        } else ends[row] = Math.max(ends[row], right)
        return { m, x, y: row * ROW_H, flip }
      })
    return { rows, height: Math.max(LANE_MIN, ends.length * ROW_H + 14) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, chartW, totalDays])

  // A fixed-ratio slide scales its chart down rather than overflowing.
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (!shape.h) {
      setScale(1)
      return
    }
    const available = shape.h - PAD * 2 - 92 // header and footer
    const natural = el.scrollHeight / (scale || 1)
    setScale(Math.min(1, available / natural))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.h, shape.w, lanes, ink])

  const laneIndex = useMemo(
    () => new Map(lanes.filter((l) => l.name !== MS_LANE).map((l, i) => [l.name, i])),
    [lanes],
  )

  const colorOf = (t: Task, lane: string) => {
    if (ink === 'mono') return isDone(t) ? '#9aa0a8' : '#31363d'
    if (ink === 'priority') return t.priority ? PRIORITY_COLOR[t.priority as Priority] : '#9aa0a8'
    if (ink === 'group') return LANE_INK[(laneIndex.get(lane) ?? 0) % LANE_INK.length]
    return STATUS_COLOR[statusOf(t)]
  }

  const months = monthsBetween(range.from, range.to)
  const todayX = now >= range.from && now <= range.to ? xOf(toISO(now)) : null
  const compDay = parseDay(ds.meta.competition)
  const compX = compDay && compDay >= range.from && compDay <= range.to ? xOf(ds.meta.competition) : null
  const scope = isAllTeams ? 'All subteams' : subteam
  const laneH = (h: number) => Math.max(LANE_MIN, h)

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-auto bg-[#eceae5]">
      <style>{`
        @media print {
          .tp-chrome { display: none !important; }
          @page { size: ${shape.page}; margin: 10mm; }
          html, body { background: #fff !important; }
          .tp-sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .tp-lane { break-inside: avoid; }
      `}</style>

      <div className="tp-chrome sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#d4d1ca] bg-[#eceae5]/95 px-6 py-3 backdrop-blur">
        <div>
          <div className="text-[15px] font-semibold text-[#14171c]">Timeline · {scope}</div>
          <div className="text-xs text-[#6b7280]">
            {fmtDayYear(toISO(range.from))} – {fmtDayYear(toISO(range.to))} · {tasks.length} tasks ·{' '}
            {milestones.length} milestones
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={ratio}
            onChange={(e) => setRatio(e.target.value as Ratio)}
            options={RATIOS.map((r) => ({ value: r.value, label: r.label }))}
            className="text-[#14171c]"
          />
          <Select
            value={ink}
            onChange={(e) => setInk(e.target.value as Ink)}
            options={INKS}
            className="text-[#14171c]"
          />
          <Button onClick={() => window.print()}>Print / Save as PDF</Button>
          <Button onClick={onClose} aria-label="Close print view">
            <IconClose className="size-3.5" />
            Close
          </Button>
        </div>
      </div>

      <div className="flex justify-center px-6 py-6">
        <div
          className="tp-sheet overflow-hidden bg-white shadow-xl shadow-black/10"
          style={{ width: shape.w, height: shape.h || undefined, padding: PAD }}
        >
          <header className="mb-4 flex items-baseline justify-between border-b-2 border-[#b31b1b] pb-2">
            <h1 className="text-[26px] leading-none font-semibold tracking-tight text-[#14171c]">
              ARG27 · <span className="font-normal text-[#5b6068]">{scope}</span>
            </h1>
            <span className="text-[12px] text-[#6b7280]">
              {fmtDayYear(toISO(range.from))} – {fmtDayYear(toISO(range.to))}
            </span>
          </header>

          <div
            ref={bodyRef}
            style={{
              width: contentW,
              transform: scale < 1 ? `scale(${scale})` : undefined,
              transformOrigin: 'top left',
            }}
          >
            {/* month scale */}
            <div className="flex border-b border-[#d4d1ca]">
              <div style={{ width: LABEL_W }} />
              <div className="relative h-6" style={{ width: chartW }}>
                {months.map((m) => {
                  const x = (daysBetween(range.from, m) / totalDays) * chartW
                  if (x < -40) return null
                  return (
                    <div key={+m} className="absolute top-0 h-6" style={{ left: x }}>
                      <div className="h-full w-px bg-[#d4d1ca]" />
                      <span className="absolute top-0.5 left-1.5 text-[11px] font-medium whitespace-nowrap text-[#6b7280]">
                        {fmtMonth(m)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {lanes.map((lane) => (
              <div key={lane.name} className="tp-lane flex border-b border-[#e4e1db]">
                <div
                  className="shrink-0 border-r border-[#e4e1db] py-2 pr-3"
                  style={{ width: LABEL_W }}
                >
                  <div className="text-[10px] tracking-wide text-[#9aa0a8] uppercase">
                    {lane.name === MS_LANE
                      ? `${lane.milestones.length} deadlines`
                      : `${groupCode(ds, lane.name)} · ${lane.bars.length} tasks`}
                  </div>
                  <div className="mt-0.5 text-[14px] leading-tight font-semibold text-[#14171c]">
                    {lane.name}
                  </div>
                </div>

                <div
                  className="relative"
                  style={{
                    width: chartW,
                    height: lane.name === MS_LANE ? msRows.height : laneH(lane.height),
                  }}
                >
                  {months.map((m) => {
                    const x = (daysBetween(range.from, m) / totalDays) * chartW
                    return (
                      <div
                        key={`g${+m}`}
                        className="absolute top-0 bottom-0 w-px bg-[#f0eeea]"
                        style={{ left: x }}
                      />
                    )
                  })}
                  {todayX !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-[1.5px] bg-[#b31b1b]"
                      style={{ left: todayX }}
                    />
                  )}
                  {compX !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-px"
                      style={{
                        left: compX,
                        background:
                          'repeating-linear-gradient(to bottom,#14171c 0 4px,transparent 4px 8px)',
                      }}
                    />
                  )}

                  {lane.bars.map(({ item, x, w, y, labelW, flip }) => {
                    const overdue = healthOf(item, now).band === 'overdue' && !isDone(item)
                    return (
                      <div
                        key={item.id}
                        className={`absolute flex items-center gap-2 ${flip ? 'flex-row-reverse' : ''}`}
                        style={{
                          ...(flip ? { right: chartW - (x + w) } : { left: x }),
                          top: y + MS_STRIP,
                          height: ROW_H - 8,
                        }}
                      >
                        <span
                          className="h-full shrink-0 rounded-[2px]"
                          style={{
                            width: w,
                            background: colorOf(item, lane.name),
                            outline: overdue ? '1.5px solid #b31b1b' : undefined,
                            outlineOffset: 1,
                          }}
                        />
                        <span
                          className="text-[13px] leading-tight whitespace-nowrap text-[#31363d]"
                          style={{ maxWidth: labelW }}
                        >
                          {item.title}
                        </span>
                      </div>
                    )
                  })}

                  {(lane.name === MS_LANE ? msRows.rows : []).map(({ m, x, y, flip }) => {
                    return (
                      <div
                        key={m.id}
                        className={`absolute flex items-center gap-1.5 ${flip ? 'flex-row-reverse' : ''}`}
                        style={{ ...(flip ? { right: chartW - x - 12 } : { left: x }), top: y + 6 }}
                      >
                      <span
                        className="block size-3 shrink-0 rotate-45"
                        style={{
                          background: ink === 'mono' ? '#14171c' : STATUS_COLOR[statusOf(m)],
                        }}
                      />
                        <span className="text-[13px] font-semibold whitespace-nowrap text-[#14171c]">
                          {m.title}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <footer className="mt-3 flex items-center justify-between text-[10px] text-[#9aa0a8]">
            <span>◆ milestone · ▬ task · red rule = today · dashed = competition</span>
            <span>{ds.meta.source}</span>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  )
}
