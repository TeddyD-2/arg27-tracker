import seed from '../data/seed.json'

export interface Assembly {
  subteam: string
  /** `A06` — unique only within its subteam. */
  code: string
  name: string
}

/**
 * The grouping dimension inside a subteam is the assembly (the sheet's
 * `Part Design` column). All 83 assembly names in the workbook are distinct, so
 * one flat name -> code map is unambiguous; the list for the subteam on screen
 * comes off the scoped dataset instead.
 */
export const CODE_BY_ASSEMBLY: Record<string, string> = Object.fromEntries(
  (seed as { assemblies: Assembly[] }).assemblies.map((a) => [a.name, a.code]),
)

/**
 * Work is grouped by assembly inside one subteam, and by subteam when the whole
 * program is on screen — the assembly codes only mean anything within their own
 * subteam, so across all thirteen they would collide and read as noise.
 */
export type GroupBy = 'assembly' | 'subteam'

export const GROUP_LABEL: Record<GroupBy, { one: string; many: string; all: string }> = {
  assembly: { one: 'Assembly', many: 'Assemblies', all: 'All assemblies' },
  subteam: { one: 'Subteam', many: 'Subteams', all: 'All subteams' },
}

/** Work states, ordered from "not begun" to "done". */
export const STATUSES = [
  'Not Started',
  'Planned',
  'In Progress',
  'In Review',
  'Blocked',
  'Complete',
] as const
export type Status = (typeof STATUSES)[number]

/**
 * Stack/segment order for charts. Blocked sits beside Not Started so the red
 * never lands next to the green — see the palette note in index.css.
 */
export const STATUS_STACK_ORDER: Status[] = [
  'Blocked',
  'Not Started',
  'Planned',
  'In Progress',
  'In Review',
  'Complete',
]

export const STATUS_COLOR: Record<Status, string> = {
  Blocked: '#d03b3b',
  'Not Started': '#71767f',
  Planned: '#1c5cab',
  'In Progress': '#3987e5',
  'In Review': '#86b6ef',
  Complete: '#0ca30c',
}

/** Fraction of the work a state represents, for weighted rollups. */
export const STATUS_WEIGHT: Record<Status, number> = {
  'Not Started': 0,
  Blocked: 0,
  Planned: 0.1,
  'In Progress': 0.5,
  'In Review': 0.85,
  Complete: 1,
}

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const PRIORITY_COLOR: Record<Priority, string> = {
  Critical: '#d03b3b',
  High: '#ec835a',
  Medium: '#fab219',
  Low: '#71767f',
}

export const PRIORITY_RANK: Record<Priority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

export const GOAL_STATUSES = ['On Track', 'At Risk', 'Delayed', 'Complete'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const GOAL_STATUS_COLOR: Record<GoalStatus, string> = {
  'On Track': '#0ca30c',
  'At Risk': '#fab219',
  Delayed: '#d03b3b',
  Complete: '#3987e5',
}

export interface Goal {
  id: string
  subteam: string
  /** The Goals sheet numbers goals in the milestone namespace (`AU_M001` is
   *  both a goal and a milestone), so the import re-keys them and keeps the
   *  sheet's own ID here. */
  sheetId?: string
  title: string
  status: GoalStatus | ''
  successMetric: string
  notes: string
  duplicateOf?: string
}

export interface Milestone {
  id: string
  subteam: string
  title: string
  start: string
  due: string
  status: Status | ''
  goalIds: string[]
  dependsOn: string[]
  notes: string
  duplicateOf?: string
}

export interface Task {
  id: string
  subteam: string
  /** The workbook's own ID, kept when a merged assembly renumbers the task. */
  sheetId?: string
  title: string
  assembly: string
  /** `A06` — the assembly's code, kept so IDs and chips agree with the sheet. */
  assemblyCode: string
  start: string
  due: string
  status: Status | ''
  milestoneId: string
  owners: string[]
  priority: Priority | ''
  dependsOn: string[]
  deliverable: string
  notes: string
  duplicateOf?: string
}

export type EntityKind = 'goal' | 'milestone' | 'task'

export interface ChangeEntry {
  id: string
  at: number
  kind: EntityKind
  entityId: string
  entityTitle: string
  /** Human-readable summary, e.g. `Status: Not Started → In Progress`. */
  summary: string
  action: 'created' | 'updated' | 'deleted'
}

export interface Dataset {
  meta: {
    source: string
    seasonStart: string
    seasonEnd: string
    competition: string
  }
  subteams: { code: string; name: string }[]
  assemblies: Assembly[]
  /** What the views group and filter by, set when the dataset is scoped. */
  groupBy: GroupBy
  /** The groups themselves — this subteam's assemblies, or every subteam. */
  groups: { code: string; name: string }[]
  goals: Goal[]
  milestones: Milestone[]
  tasks: Task[]
  log: ChangeEntry[]
}

/** The group a task belongs to under the dataset's current grouping. */
export function groupOf(ds: Dataset, t: { assembly: string; subteam: string }): string {
  return ds.groupBy === 'subteam' ? t.subteam : t.assembly
}

export function groupCode(ds: Dataset, name: string): string {
  return ds.groups.find((g) => g.name === name)?.code ?? CODE_BY_ASSEMBLY[name] ?? '??'
}
