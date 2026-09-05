/**
 * All dates in the dataset are plain `YYYY-MM-DD` calendar days with no
 * timezone. Parsing them with `new Date(str)` would drag them through UTC and
 * shift them a day for anyone west of Greenwich, so everything here works on
 * local-noon Date objects instead.
 */

export const DAY_MS = 86_400_000

export function parseDay(iso: string | undefined | null): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
}

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function today(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12)
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

/** Whole days from `a` to `b`; negative when `b` is in the past. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDay(iso: string | undefined | null): string {
  const d = parseDay(iso)
  if (!d) return '—'
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function fmtDayYear(iso: string | undefined | null): string {
  const d = parseDay(iso)
  if (!d) return '—'
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function fmtMonth(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

/** "in 4d" / "3d ago" / "today" — `null` when there is no date. */
export function relativeDays(iso: string | undefined | null, from = today()): string | null {
  const d = parseDay(iso)
  if (!d) return null
  const n = daysBetween(from, d)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n < 0) return `${-n}d ago`
  if (n < 21) return `in ${n}d`
  if (n < 60) return `in ${Math.round(n / 7)}w`
  return `in ${Math.round(n / 30)}mo`
}

export function fmtRelativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** First-of-month Dates covering `[from, to]` inclusive. */
export function monthsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = []
  const cur = new Date(from.getFullYear(), from.getMonth(), 1, 12)
  while (cur <= to) {
    out.push(new Date(cur))
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}
