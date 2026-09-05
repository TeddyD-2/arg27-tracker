import {
  groupCode,
  groupOf,
  STATUS_WEIGHT,
  type Dataset,
  type Goal,
  type Milestone,
  type Priority,
  type Status,
  type Task,
} from './types'
import { daysBetween, parseDay, today } from './dates'

export type WorkItem = Task | Milestone

export function statusOf(item: { status: Status | '' }): Status {
  return item.status || 'Not Started'
}

export function isDone(item: { status: Status | '' }): boolean {
  return item.status === 'Complete'
}

/** Weighted completion of a set of items, 0–1. Empty set reads as 0. */
export function progressOf(items: { status: Status | '' }[]): number {
  if (!items.length) return 0
  const sum = items.reduce((acc, i) => acc + STATUS_WEIGHT[statusOf(i)], 0)
  return sum / items.length
}

export interface Health {
  /** 'overdue' | 'due-soon' | 'ok' | 'none' (no due date) */
  band: 'overdue' | 'due-soon' | 'ok' | 'none'
  daysToDue: number | null
}

export function healthOf(item: { due: string; status: Status | '' }, now = today()): Health {
  const due = parseDay(item.due)
  if (!due) return { band: 'none', daysToDue: null }
  const n = daysBetween(now, due)
  if (isDone(item)) return { band: 'ok', daysToDue: n }
  if (n < 0) return { band: 'overdue', daysToDue: n }
  if (n <= 14) return { band: 'due-soon', daysToDue: n }
  return { band: 'ok', daysToDue: n }
}

/**
 * A single 0–100 attention score used to rank the "Needs attention" queue.
 * Lateness dominates, then priority, then blockers and unstarted-but-imminent
 * work. It only ever ranks — nothing is hidden because of a low score.
 */
export function attentionScore(t: Task, now = today()): number {
  const h = healthOf(t, now)
  if (isDone(t)) return 0
  let s = 0
  if (h.band === 'overdue') s += Math.min(45, 20 + -h.daysToDue!)
  else if (h.band === 'due-soon') s += Math.max(6, 22 - (h.daysToDue ?? 14))
  if (t.status === 'Blocked') s += 25
  const pri: Record<Priority, number> = { Critical: 22, High: 14, Medium: 7, Low: 2 }
  s += t.priority ? pri[t.priority] : 4
  if (!t.owners.length) s += 6
  if (h.band !== 'none' && h.daysToDue !== null && h.daysToDue <= 7 && statusOf(t) === 'Not Started')
    s += 8
  return Math.min(100, Math.round(s))
}

/* ------------------------------------------------------------------ rollups */

export interface GoalRollup {
  goal: Goal
  tasks: Task[]
  milestones: Milestone[]
  progress: number
  /** Status the data implies, which may disagree with the declared status. */
  computedStatus: 'On Track' | 'At Risk' | 'Delayed' | 'Complete' | 'Not Started'
  overdue: number
  blocked: number
  nextDue: Task | Milestone | null
}

/**
 * Goal → milestone → task. The sheet links tasks to milestones and stops there,
 * so a goal's work is the milestones pointed at it plus everything feeding them.
 */
export function rollupGoal(goal: Goal, ds: Dataset, now = today()): GoalRollup {
  const milestones = ds.milestones.filter((m) => m.goalIds.includes(goal.id))
  const msIds = new Set(milestones.map((m) => m.id))
  const tasks = ds.tasks.filter((t) => msIds.has(t.milestoneId))
  const items: WorkItem[] = [...tasks, ...milestones]
  const progress = progressOf(items)
  const overdue = items.filter((i) => healthOf(i, now).band === 'overdue').length
  const blocked = items.filter((i) => i.status === 'Blocked').length

  const dated = items
    .filter((i) => i.due && !isDone(i))
    .sort((a, b) => a.due.localeCompare(b.due))
  const nextDue = dated[0] ?? null

  let computedStatus: GoalRollup['computedStatus'] = 'On Track'
  if (!items.length) computedStatus = 'Not Started'
  else if (progress >= 0.999) computedStatus = 'Complete'
  else if (overdue > 0 || blocked > 1) computedStatus = 'Delayed'
  else if (blocked > 0 || items.some((i) => healthOf(i, now).band === 'due-soon' && !i.status))
    computedStatus = 'At Risk'

  return { goal, tasks, milestones, progress, computedStatus, overdue, blocked, nextDue }
}

export interface MilestoneRollup {
  milestone: Milestone
  tasks: Task[]
  progress: number
  overdue: number
}

export function rollupMilestone(m: Milestone, ds: Dataset, now = today()): MilestoneRollup {
  const tasks = ds.tasks.filter((t) => t.milestoneId === m.id)
  return {
    milestone: m,
    tasks,
    progress: tasks.length ? progressOf(tasks) : STATUS_WEIGHT[statusOf(m)],
    overdue: tasks.filter((t) => healthOf(t, now).band === 'overdue').length,
  }
}

export interface GroupRollup {
  name: string
  code: string
  tasks: Task[]
  milestones: Milestone[]
  progress: number
  overdue: number
  blocked: number
  unassigned: number
  byStatus: Record<Status, number>
}

/** One row per assembly, or per subteam when the whole program is on screen. */
export function rollupGroups(ds: Dataset, now = today()): GroupRollup[] {
  // Every group gets a row, including ones nobody has filled in yet — an empty
  // workstream is a finding, not something to hide.
  const names = ds.groups.map((g) => g.name)
  for (const t of ds.tasks) {
    const n = groupOf(ds, t)
    if (n && !names.includes(n)) names.push(n)
  }
  return names
    .map((name) => {
      const tasks = ds.tasks.filter((t) => groupOf(ds, t) === name)
      const msIds = new Set(tasks.map((t) => t.milestoneId).filter(Boolean))
      const milestones = ds.milestones.filter((m) => msIds.has(m.id))
      const byStatus = {} as Record<Status, number>
      for (const t of tasks) {
        const s = statusOf(t)
        byStatus[s] = (byStatus[s] ?? 0) + 1
      }
      return {
        name,
        code: groupCode(ds, name),
        tasks,
        milestones,
        progress: progressOf(tasks),
        overdue: tasks.filter((t) => healthOf(t, now).band === 'overdue').length,
        blocked: tasks.filter((t) => t.status === 'Blocked').length,
        unassigned: tasks.filter((t) => !t.owners.length).length,
        byStatus,
      }
    })
    .sort((a, b) => b.tasks.length - a.tasks.length)
}

export interface PersonRollup {
  name: string
  tasks: Task[]
  /** Assemblies, or subteams in the whole-program view. */
  groups: string[]
  progress: number
  overdue: number
  dueSoon: number
  blocked: number
  critical: number
  active: number
}

export function rollupPeople(ds: Dataset, now = today()): PersonRollup[] {
  const map = new Map<string, Task[]>()
  for (const t of ds.tasks) {
    for (const o of t.owners) {
      if (!map.has(o)) map.set(o, [])
      map.get(o)!.push(t)
    }
  }
  return [...map.entries()]
    .map(([name, tasks]) => ({
      name,
      tasks,
      groups: [...new Set(tasks.map((t) => groupOf(ds, t)).filter(Boolean))],
      progress: progressOf(tasks),
      overdue: tasks.filter((t) => healthOf(t, now).band === 'overdue').length,
      dueSoon: tasks.filter((t) => healthOf(t, now).band === 'due-soon').length,
      blocked: tasks.filter((t) => t.status === 'Blocked').length,
      critical: tasks.filter((t) => t.priority === 'Critical' && !isDone(t)).length,
      active: tasks.filter((t) => !isDone(t)).length,
    }))
    .sort((a, b) => b.active - a.active)
}

/* ------------------------------------------------------------- data quality */

export type IssueSeverity = 'high' | 'medium' | 'low'

export interface DataIssue {
  id: string
  kind: 'goal' | 'milestone' | 'task'
  entityId: string
  entityTitle: string
  rule: string
  detail: string
  severity: IssueSeverity
  /** Field the fix belongs in, so the UI can deep-link into the editor. */
  field?: string
}

/**
 * The sheet this app replaces has a lot of half-filled rows. Rather than hide
 * that, surface it: every rule below is something a lead can actually fix, and
 * nothing is silently defaulted away.
 */
export function findIssues(ds: Dataset, now = today()): DataIssue[] {
  const out: DataIssue[] = []
  const push = (i: DataIssue) => out.push(i)
  const taskIds = new Set(ds.tasks.map((t) => t.id))
  const msIds = new Set(ds.milestones.map((m) => m.id))

  for (const t of ds.tasks) {
    const base = { kind: 'task' as const, entityId: t.id, entityTitle: t.title }
    if (!t.status)
      push({ ...base, id: `${t.id}:status`, rule: 'No status', detail: 'Status was never set.', severity: 'medium', field: 'status' })
    if (!t.due)
      push({ ...base, id: `${t.id}:due`, rule: 'No due date', detail: 'Cannot be scheduled or tracked on the timeline.', severity: 'high', field: 'due' })
    if (!t.owners.length)
      push({ ...base, id: `${t.id}:owner`, rule: 'No owner', detail: 'Nobody is responsible for this task.', severity: 'high', field: 'owners' })
    if (!t.priority)
      push({ ...base, id: `${t.id}:priority`, rule: 'No priority', detail: 'Priority drives triage order.', severity: 'low', field: 'priority' })
    if (!t.milestoneId)
      push({ ...base, id: `${t.id}:link`, rule: 'Not linked to a milestone', detail: 'Work that rolls up to nothing.', severity: 'medium', field: 'milestoneId' })
    if (!t.assembly)
      push({ ...base, id: `${t.id}:assembly`, rule: 'No assembly', detail: 'Sits outside every workstream on the sheet.', severity: 'medium', field: 'assembly' })
    if (t.start && t.due && t.start > t.due)
      push({ ...base, id: `${t.id}:order`, rule: 'Start after due', detail: `${t.start} → ${t.due}`, severity: 'high', field: 'start' })
    for (const d of t.dependsOn)
      if (!taskIds.has(d))
        push({ ...base, id: `${t.id}:dep:${d}`, rule: 'Broken dependency', detail: `References ${d}, which does not exist.`, severity: 'medium', field: 'dependsOn' })
    if (t.milestoneId && !msIds.has(t.milestoneId))
      push({ ...base, id: `${t.id}:ms`, rule: 'Broken milestone link', detail: `References ${t.milestoneId}.`, severity: 'medium', field: 'milestoneId' })
    if (t.duplicateOf)
      push({ ...base, id: `${t.id}:dup`, rule: 'Duplicate ID in source', detail: `Shares ID ${t.duplicateOf} with another row.`, severity: 'low' })
    // A task due after the milestone it feeds cannot possibly support it.
    if (t.milestoneId && t.due) {
      const m = ds.milestones.find((x) => x.id === t.milestoneId)
      if (m?.due && t.due > m.due)
        push({ ...base, id: `${t.id}:late`, rule: 'Due after its milestone', detail: `Task ${t.due} vs milestone ${m.due}.`, severity: 'high', field: 'due' })
    }
  }

  for (const m of ds.milestones) {
    const base = { kind: 'milestone' as const, entityId: m.id, entityTitle: m.title }
    if (!m.due)
      push({ ...base, id: `${m.id}:due`, rule: 'No due date', detail: 'Milestones are deadlines; this one has none.', severity: 'high', field: 'due' })
    if (!m.status)
      push({ ...base, id: `${m.id}:status`, rule: 'No status', detail: 'Status was never set.', severity: 'medium', field: 'status' })
    if (!m.goalIds.length)
      push({ ...base, id: `${m.id}:goal`, rule: 'Not linked to a goal', detail: 'Milestones should be subsets of a goal.', severity: 'medium', field: 'goalIds' })
    if (!ds.tasks.some((t) => t.milestoneId === m.id))
      push({ ...base, id: `${m.id}:tasks`, rule: 'No supporting tasks', detail: 'No task rolls up to this milestone.', severity: 'low' })
    for (const d of m.dependsOn)
      if (!msIds.has(d))
        push({ ...base, id: `${m.id}:dep:${d}`, rule: 'Broken dependency', detail: `References ${d}.`, severity: 'medium', field: 'dependsOn' })
    if (m.duplicateOf)
      push({ ...base, id: `${m.id}:dup`, rule: 'Duplicate ID in source', detail: `Shares ID ${m.duplicateOf} with another row.`, severity: 'low' })
  }

  for (const g of ds.goals) {
    const base = { kind: 'goal' as const, entityId: g.id, entityTitle: g.title }
    if (!g.successMetric)
      push({ ...base, id: `${g.id}:metric`, rule: 'No success metric', detail: 'No definition of done.', severity: 'high', field: 'successMetric' })
    if (!g.status)
      push({ ...base, id: `${g.id}:status`, rule: 'No status', detail: 'Status was never set.', severity: 'medium', field: 'status' })
    const roll = rollupGoal(g, ds, now)
    if (!roll.milestones.length)
      push({ ...base, id: `${g.id}:empty`, rule: 'No work attached', detail: 'No milestone rolls up to this goal — the sheet has no column for that link, so it has to be made here.', severity: 'medium' })
    if (g.status && g.status !== roll.computedStatus && roll.computedStatus !== 'Not Started')
      push({ ...base, id: `${g.id}:drift`, rule: 'Status disagrees with the data', detail: `Marked “${g.status}” but the work reads “${roll.computedStatus}”.`, severity: 'medium', field: 'status' })
  }

  const rank = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

/** Overall 0–100 completeness of the tracker's required fields. */
export function completenessScore(ds: Dataset): number {
  const checks: boolean[] = []
  for (const t of ds.tasks) checks.push(!!t.status, !!t.due, !!t.owners.length, !!t.priority, !!t.milestoneId)
  for (const m of ds.milestones) checks.push(!!m.due, !!m.status, !!m.goalIds.length)
  for (const g of ds.goals) checks.push(!!g.successMetric, !!g.status)
  if (!checks.length) return 100
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

/* --------------------------------------------------------------- scheduling */

/** Items whose blockers are unfinished, i.e. genuinely stuck. */
export function blockedChains(ds: Dataset) {
  const byId = new Map(ds.tasks.map((t) => [t.id, t]))
  return ds.tasks
    .filter((t) => !isDone(t) && t.dependsOn.length)
    .map((t) => ({
      task: t,
      blockers: t.dependsOn.map((d) => byId.get(d)).filter((x): x is Task => !!x && !isDone(x)),
    }))
    .filter((x) => x.blockers.length)
    .sort((a, b) => b.blockers.length - a.blockers.length)
}
