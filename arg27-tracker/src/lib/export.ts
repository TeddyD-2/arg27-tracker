import type { Dataset } from './types'

function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join('; ') : (v ?? '')
  const str = String(s)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','))
  return lines.join('\r\n')
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

/** `ARG27-autonomy-tasks-2026-09-04.csv` — the subteam on screen, in the name. */
const slug = (ds: Dataset) => (ds.tasks[0]?.subteam ?? ds.milestones[0]?.subteam ?? 'arg27')
  .toLowerCase()
  .replace(/\s+/g, '-')

/** Round-trip back to the subteam task page's column names, so an export can be pasted back in. */
export function exportTasksCsv(ds: Dataset) {
  const rows = ds.tasks.map((t) => ({
    ID: t.id,
    Task: t.title,
    Subteam: t.subteam,
    Start: t.start,
    Due: t.due,
    Status: t.status,
    Milestone: t.milestoneId,
    Owner: t.owners.join(', '),
    Priority: t.priority,
    Dependencies: t.dependsOn.join(', '),
    Deliverables: t.deliverable,
    Notes: t.notes,
    'Part Design': t.assemblyCode ? `${t.assemblyCode} - ${t.assembly}` : t.assembly,
  }))
  download(
    `ARG27-${slug(ds)}-tasks-${stamp()}.csv`,
    toCsv(rows, Object.keys(rows[0] ?? { ID: '' })),
    'text/csv;charset=utf-8',
  )
}

export function exportMilestonesCsv(ds: Dataset) {
  const rows = ds.milestones.map((m) => ({
    ID: m.id,
    Task: m.title,
    Subteam: m.subteam,
    Start: m.start,
    Due: m.due,
    Status: m.status,
    Dependencies: m.dependsOn.join(', '),
    Notes: m.notes,
    // Not a column on the sheet — the goal link only exists in the tracker.
    Goals: m.goalIds.join(', '),
  }))
  download(
    `ARG27-${slug(ds)}-milestones-${stamp()}.csv`,
    toCsv(rows, Object.keys(rows[0] ?? { ID: '' })),
    'text/csv;charset=utf-8',
  )
}

export function exportJson(ds: Dataset) {
  download(`ARG27-${slug(ds)}-tracker-${stamp()}.json`, JSON.stringify(ds, null, 1), 'application/json')
}
