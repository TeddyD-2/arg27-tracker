import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toBlob, toSvg } from 'html-to-image'
import { useStore } from '../lib/store'
import { healthOf, isDone, statusOf } from '../lib/derive'
import {
  daysBetween,
  fmtDayYear,
  fmtMonth,
  monthsBetween,
  parseDay,
  toISO,
  today,
} from '../lib/dates'
import {
  groupCode,
  groupOf,
  PRIORITY_COLOR,
  STATUS_COLOR,
  type Milestone,
  type Priority,
  type Task,
} from '../lib/types'
import { buildLanes, MS_LANE, MS_STRIP, span, textMeasurer } from '../lib/lanes'
import { useLaneOrder } from '../lib/laneOrder'
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
const LANE_MIN = 68

/** The stack from index.css, so measurement matches what is drawn. */
const FACE = `'Proxima Nova', 'proxima-nova', Mulish, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
/** Captions are 14px/500; milestone titles 15px/700. */
const measureTask = textMeasurer(`500 14px ${FACE}`)
const measureMilestone = textMeasurer(`700 15px ${FACE}`)

type Ratio = 'letter' | 'slide169' | 'slide43' | 'portrait'

/**
 * Page shapes. `h` fixes the canvas so the sheet really is that ratio — a deck
 * needs its slide to be 16:9 whatever the content does — and the chart is
 * scaled down to fit rather than spilling off the bottom. `h: 0` lets the sheet
 * grow to its content, which is what you want on paper.
 */
const RATIOS: {
  value: Ratio
  label: string
  w: number
  h: number
  page: string
}[] = [
  // Letter landscape is 11x8.5. Letting the content set the height made this
  // shape come out near-square (1040x1009), so exporting with the default and
  // dropping it on a 16:9 slide gave a letterboxed mess.
  {
    value: 'letter',
    label: 'Paper · landscape',
    w: 1040,
    h: 804,
    page: 'landscape',
  },
  {
    value: 'slide169',
    label: 'Slide · 16:9',
    w: 1280,
    h: 720,
    page: 'landscape',
  },
  {
    value: 'slide43',
    label: 'Slide · 4:3',
    w: 1024,
    h: 768,
    page: 'landscape',
  },
  {
    value: 'portrait',
    label: 'Paper · portrait',
    w: 800,
    h: 1035,
    page: 'portrait',
  },
]

type Format = 'png05' | 'png1' | 'png15' | 'png2' | 'png3' | 'png4' | 'png6' | 'png8' | 'svg'

const FORMATS: { value: Format; note: string; scale: number }[] = [
  { value: 'png05', note: 'thumbnail', scale: 0.5 },
  { value: 'png1', note: 'small file', scale: 1 },
  { value: 'png15', note: '1080p slide', scale: 1.5 },
  { value: 'png2', note: 'screen', scale: 2 },
  { value: 'png3', note: 'print', scale: 3 },
  { value: 'png4', note: 'large print', scale: 4 },
  { value: 'png6', note: 'poster', scale: 6 },
  { value: 'png8', note: 'max', scale: 8 },
  // The renderer emits a single <foreignObject> wrapping HTML rather than real
  // SVG shapes. Browsers draw that; PowerPoint, Keynote, Google Slides,
  // Illustrator and Inkscape all ignore it and show nothing. Labelled so nobody
  // reaches for it expecting a vector file a deck can use.
  { value: 'svg', note: 'web only — decks cannot read it', scale: 1 },
]

/**
 * Canvas has a hard ceiling — Chrome refuses much beyond 268M pixels and simply
 * hands back a blank bitmap rather than an error. Stay clear of it, and tell
 * the reader when a multiple has been clamped instead of silently under-
 * delivering the resolution they picked.
 */
const MAX_PIXELS = 240_000_000
const MAX_SIDE = 16_000

function fit(w: number, h: number, scale: number) {
  const capped = Math.min(scale, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_PIXELS / (w * h)))
  // Round down to a sensible step so the label never reads "3.87x". The floor
  // is well below 1 so the deliberately small multiples are not clamped up.
  const usable = Math.max(0.1, Math.floor(capped * 10) / 10)
  return { scale: usable, clamped: usable < scale - 0.05 }
}

type Ink = 'status' | 'priority' | 'group' | 'mono'

const INKS: { value: Ink; label: string }[] = [
  { value: 'status', label: 'Colour: status' },
  { value: 'priority', label: 'Colour: priority' },
  { value: 'group', label: 'Colour: lane' },
  { value: 'mono', label: 'Mono (ink saving)' },
]

/** A calm categorical ramp for lanes — distinguishable, and legible on white. */
const LANE_INK = ['#2f6fb5', '#0f8a6a', '#b3591b', '#7a4fb5', '#a8323f', '#3d7a2f', '#8a6d1f']

/** Redraw a bitmap at an exact size, for the sub-1x exports. */
async function resample(blob: Blob, w: number, h: number): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('could not resample'))),
      'image/png',
    ),
  )
}

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
  // The sheet is the card at a larger scale, lane order included.
  const { order } = useLaneOrder(subteam)
  const [ink, setInk] = useState<Ink>('status')
  const [ratio, setRatio] = useState<Ratio>('letter')
  const [format, setFormat] = useState<Format>('png2')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Measured height of the paper shapes, whose sheet grows with its content. */
  const [sheetH, setSheetH] = useState(0)
  const now = today()

  const shape = RATIOS.find((r) => r.value === ratio)!
  const contentW = shape.w - PAD * 2

  /**
   * The chart is laid out at `layoutW` and then scaled so it renders exactly
   * `contentW` wide. On a fixed-ratio sheet that width is solved for rather
   * than assumed: a wider layout gives captions more room, so lanes pack into
   * fewer rows and the chart gets shorter; a narrower one does the reverse.
   * Fitting purely by shrinking, as this used to, filled the height and left a
   * quarter of a 16:9 slide empty.
   */
  const [layoutW, setLayoutW] = useState(contentW)
  const totalDays = Math.max(1, daysBetween(range.from, range.to))
  const chartW = layoutW - LABEL_W
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
        order,
        rowH: ROW_H,
        // Measured, not estimated, and deliberately uncapped: a long title
        // takes the width it takes and the packer drops it to its own row.
        measure: measureTask,
      }),
    [tasks, milestones, range, chartW, totalDays, ds, order],
  )

  /**
   * The milestone strip is one row on screen because the diamonds are unlabelled
   * there. Here every milestone carries its name, so they have to be packed onto
   * rows as well or the titles sit on top of one another.
   */
  const msRows = useMemo(() => {
    const strip = lanes.find((l) => l.name === MS_LANE)
    if (!strip)
      return {
        rows: [] as { m: Milestone; x: number; y: number; flip: boolean }[],
        height: 0,
      }
    const ends: number[] = []
    const rows = [...strip.milestones]
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((m) => {
        const x = xOf(m.due) - 6
        const labelW = measureMilestone(m.title) + 4
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

  const sheetRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLElement>(null)
  const footRef = useRef<HTMLElement>(null)
  const [scale, setScale] = useState(1)
  const [naturalH, setNaturalH] = useState(0)
  const passes = useRef(0)

  // A new shape restarts the solve from the sheet's own width.
  useLayoutEffect(() => {
    passes.current = 0
    setLayoutW(shape.w - PAD * 2)
  }, [shape.w, shape.h])

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (!shape.h) {
      setScale(1)
      return
    }
    const chrome = (headRef.current?.offsetHeight ?? 0) + (footRef.current?.offsetHeight ?? 0) + 24
    const avail = shape.h - PAD * 2 - chrome
    // offsetHeight ignores the transform, so this is the unscaled height.
    const natural = el.offsetHeight
    if (natural <= 0 || avail <= 0) return
    setNaturalH(natural)
    const want = Math.min(contentW * 2.4, Math.max(560, (natural * contentW) / avail))
    if (Math.abs(want - layoutW) > 12 && passes.current < 8) {
      passes.current += 1
      setLayoutW(want)
      return
    }
    setScale(contentW / layoutW)
  }, [layoutW, shape.h, shape.w, contentW, lanes, msRows, ink])

  useLayoutEffect(() => {
    setSheetH(sheetRef.current?.offsetHeight ?? 0)
  }, [shape.h, shape.w, layoutW, scale, lanes, ink])

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

  /**
   * Rasterise the sheet itself, not the window — the toolbar is a sibling, so
   * it is simply not in the captured node. The sheet has a fixed pixel size, so
   * the export is exactly the shape on screen at the chosen multiple.
   */
  /**
   * The page loads Mulish from Google Fonts. The renderer cannot read that
   * stylesheet through the CSSOM — it is cross-origin, so `cssRules` throws —
   * which is what made the first attempt hang. Fetching the same URL is
   * allowed, though, so pull the CSS and inline the woff2 files by hand. Without
   * this the export silently falls back to a system face and stops matching
   * what is on screen.
   */
  const fontCss = useRef<string | null>(null)
  const embedFonts = async () => {
    if (fontCss.current !== null) return fontCss.current
    try {
      const sheets = [...document.querySelectorAll('link[rel=stylesheet]')]
        .map((l) => (l as HTMLLinkElement).href)
        .filter((h) => h.includes('fonts.googleapis.com'))
      let css = ''
      for (const href of sheets) {
        const full = await fetch(href).then((r) => r.text())
        // Google serves a @font-face per unicode subset — latin, latin-ext,
        // cyrillic, greek, vietnamese — which came to twenty woff2 files and a
        // 3.8MB payload. Decoding that took longer than the render timeout, so
        // every PNG export failed. The sheet is English, so keep basic latin.
        let text = (full.match(/@font-face\s*\{[^}]*\}/g) ?? [full])
          .filter((block) => block.includes('U+0000-00FF'))
          .join('\n')
        if (!text.trim()) text = full
        for (const url of [...text.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1])) {
          const bytes = await fetch(url).then((r) => r.arrayBuffer())
          const buf = new Uint8Array(bytes as ArrayBuffer)
          // Chunked, because spreading a whole font into btoa overflows the stack.
          let bin = ''
          for (let i = 0; i < buf.length; i += 8192)
            bin += String.fromCharCode(...buf.subarray(i, i + 8192))
          text = text.replace(url, `data:font/woff2;base64,${btoa(bin)}`)
        }
        css += text
      }
      fontCss.current = css
      return css
    } catch {
      // Offline, or the font host is blocked. Export in the fallback face
      // rather than failing outright.
      fontCss.current = ''
      return ''
    }
  }

  const saveImage = async () => {
    const node = sheetRef.current
    if (!node || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const spec = FORMATS.find((f) => f.value === format)!
      const out = outputFor(spec.scale)
      const who = (isAllTeams ? 'all-subteams' : subteam).toLowerCase().replace(/\s+/g, '-')
      const name = `ARG27-${who}-timeline-${toISO(now)}`
      const embedded = await embedFonts()
      // Supplying the CSS ourselves keeps the renderer from walking the
      // stylesheets, which is both the hang and the wrong-typeface fix. The
      // renderer has no timeout of its own, so add one below: a silent stall
      // with the button stuck on "Saving…" is the worst outcome.
      const opts = embedded
        ? { backgroundColor: '#ffffff', fontEmbedCSS: embedded }
        : { backgroundColor: '#ffffff', skipFonts: true }
      // The renderer never settles when asked for a pixelRatio below 1, so the
      // small sizes are rendered at 1x and resampled down here. That is the
      // better route anyway: downsampling a larger bitmap beats rasterising
      // straight to a tiny one.
      const render =
        spec.value === 'svg'
          ? toSvg(node, opts)
          : toBlob(node, { ...opts, pixelRatio: Math.max(1, out.scale) })
              .then((b) => {
                if (!b) throw new Error('the renderer produced nothing')
                return out.scale < 1 ? resample(b, out.w, out.h) : b
              })
              .then((b) => URL.createObjectURL(b))
      const href = await Promise.race([
        render,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('rendering timed out')), 45_000),
        ),
      ])
      const a = document.createElement('a')
      a.href = href
      a.download = `${name}.${spec.value === 'svg' ? 'svg' : 'png'}`
      a.click()
      if (spec.value !== 'svg') setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'could not save the image')
    } finally {
      setSaving(false)
    }
  }

  /** Output size for a given multiple, clamped to what canvas will actually do. */
  const outputFor = (scale: number) => {
    const w = shape.w
    const h = shape.h || sheetH || shape.w * 0.75
    const f = fit(w, h, scale)
    return { ...f, w: Math.round(w * f.scale), h: Math.round(h * f.scale) }
  }

  const months = monthsBetween(range.from, range.to)
  const todayX = now >= range.from && now <= range.to ? xOf(toISO(now)) : null
  const compDay = parseDay(ds.meta.competition)
  const compX =
    compDay && compDay >= range.from && compDay <= range.to ? xOf(ds.meta.competition) : null
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
          <Select
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
            options={FORMATS.map((f) => {
              if (f.value === 'svg') return { value: f.value, label: `SVG · ${f.note}` }
              const o = outputFor(f.scale)
              return {
                value: f.value,
                label: `PNG ${f.scale}× · ${o.w}×${o.h}${o.clamped ? ' (capped)' : ''} · ${f.note}`,
              }
            })}
            className="text-[#14171c]"
          />
          <Button onClick={saveImage} disabled={saving} title={saveError ?? undefined}>
            {saving ? 'Saving…' : saveError ? 'Save failed — retry' : 'Save image'}
          </Button>
          <Button onClick={() => window.print()}>Print / PDF</Button>
          <Button onClick={onClose} aria-label="Close print view">
            <IconClose className="size-3.5" />
            Close
          </Button>
        </div>
      </div>

      <div className="flex justify-center overflow-auto px-6 py-6">
        <div
          ref={sheetRef}
          // shrink-0 matters: as a flex item the sheet would otherwise be
          // squeezed by a narrow window, and the export captured that squeezed
          // width — a 16:9 sheet came out 450x720. Let the page scroll instead.
          className="tp-sheet shrink-0 overflow-hidden bg-white shadow-xl shadow-black/10"
          style={{ width: shape.w, height: shape.h || undefined, padding: PAD }}
        >
          <header
            ref={headRef}
            className="mb-4 flex items-baseline justify-between border-b-2 border-[#b31b1b] pb-2"
          >
            <h1 className="text-[26px] leading-none font-semibold tracking-tight text-[#14171c]">
              ARG27 · <span className="font-normal text-[#5b6068]">{scope}</span>
            </h1>
            <span className="text-[12px] text-[#6b7280]">
              {fmtDayYear(toISO(range.from))} – {fmtDayYear(toISO(range.to))}
            </span>
          </header>

          {/* The scaled chart no longer occupies its laid-out size, so this
              wrapper takes the rendered height and keeps the footer in place. */}
          <div
            style={{
              height: shape.h && naturalH ? naturalH * scale : undefined,
            }}
          >
            <div
              ref={bodyRef}
              style={{
                width: layoutW,
                transform: scale === 1 ? undefined : `scale(${scale})`,
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
                        <span className="absolute top-0.5 left-1.5 text-[12px] font-semibold whitespace-nowrap text-[#5b6068]">
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
                    <div className="text-[11px] font-medium tracking-wide text-[#8b9098] uppercase">
                      {lane.name === MS_LANE
                        ? `${lane.milestones.length} deadlines`
                        : `${groupCode(ds, lane.name)} · ${lane.bars.length} tasks`}
                    </div>
                    <div className="mt-0.5 text-[15px] leading-tight font-bold text-[#14171c]">
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
                            className="text-[14px] leading-tight font-medium whitespace-nowrap text-[#272c33]"
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
                          style={{
                            ...(flip ? { right: chartW - x - 12 } : { left: x }),
                            top: y + 6,
                          }}
                        >
                          <span
                            className="block size-3 shrink-0 rotate-45"
                            style={{
                              background: ink === 'mono' ? '#14171c' : STATUS_COLOR[statusOf(m)],
                            }}
                          />
                          <span className="overflow-hidden text-[15px] font-bold text-ellipsis whitespace-nowrap text-[#14171c]">
                            {m.title}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <footer
            ref={footRef}
            className="mt-3 flex items-center justify-between text-[11px] text-[#8b9098]"
          >
            <span>◆ milestone · ▬ task · red rule = today · dashed = competition</span>
            <span>{ds.meta.source}</span>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  )
}
