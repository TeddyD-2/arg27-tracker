import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import seed from '../data/seed.json'
import {
  CODE_BY_ASSEMBLY,
  type ChangeEntry,
  type Dataset,
  type Goal,
  type Milestone,
  type Task,
} from './types'

const STORAGE_KEY = 'arg27-tracker:v2'
const SUBTEAM_KEY = 'arg27-tracker:subteam'
const DEFAULT_SUBTEAM = 'Autonomy'
/** Sentinel for the whole-program view, kept out of the subteam name space. */
export const ALL_TEAMS = '__all__'

function freshDataset(): Dataset {
  const raw = seed as unknown as Omit<Dataset, 'log' | 'groupBy' | 'groups'>
  // groupBy/groups are set by scopeTo; the unscoped copy only backs writes.
  return structuredClone({ ...raw, log: [], groupBy: 'assembly', groups: [] }) as Dataset
}

function load(): Dataset {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshDataset()
    const parsed = JSON.parse(raw) as Dataset
    if (!parsed?.tasks || !parsed?.goals || !parsed?.milestones) return freshDataset()
    return { ...parsed, log: parsed.log ?? [] }
  } catch {
    return freshDataset()
  }
}

/**
 * The workbook holds every subteam; the app shows one at a time. Writes go to
 * the whole dataset — IDs carry their subteam's prefix, so they stay unique —
 * and every view reads this scoped copy instead.
 */
function scopeTo(all: Dataset, subteam: string): Dataset {
  // The whole program, grouped by subteam rather than by assembly.
  if (subteam === ALL_TEAMS) {
    return { ...all, groupBy: 'subteam', groups: all.subteams }
  }
  const code = all.subteams.find((s) => s.name === subteam)?.code ?? ''
  return {
    ...all,
    groupBy: 'assembly',
    groups: all.assemblies.filter((a) => a.subteam === subteam),
    assemblies: all.assemblies.filter((a) => a.subteam === subteam),
    goals: all.goals.filter((g) => g.subteam === subteam),
    milestones: all.milestones.filter((m) => m.subteam === subteam),
    tasks: all.tasks.filter((t) => t.subteam === subteam),
    log: all.log.filter((l) => l.entityId.startsWith(`${code}_`)),
  }
}

/* ------------------------------------------------------------------ helpers */

/**
 * Next free ID in the sheet's own scheme: `AU_A06_T007` for a task (numbered
 * within its assembly), `AU_M001` / `AU_G001` for a milestone or goal.
 */
export function nextId(
  ds: Dataset,
  kind: 'task' | 'milestone' | 'goal',
  /** The selected subteam's code, e.g. `BU`. */
  code: string,
  /** The task's assembly code, e.g. `A02`. Resolved by the caller, which knows
   *  the assemblies of the subteam on screen. */
  assemblyCode = 'A01',
): string {
  const prefix =
    kind === 'task'
      ? `${code}_${assemblyCode}_T`
      : `${code}${kind === 'milestone' ? '_M' : '_G'}`
  const list: { id: string }[] =
    kind === 'task' ? ds.tasks : kind === 'milestone' ? ds.milestones : ds.goals
  const re = new RegExp(`^${prefix}(\\d{3})`)
  let max = 0
  for (const i of list) {
    const m = re.exec(i.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

const LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  due: 'Due',
  start: 'Start',
  owners: 'Owners',
  title: 'Title',
  goalIds: 'Goals',
  milestoneId: 'Milestone',
  assembly: 'Assembly',
  assemblyCode: 'Assembly code',
  deliverable: 'Deliverable',
  successMetric: 'Success metric',
  notes: 'Notes',
  dependsOn: 'Dependencies',
}

function show(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  return v === '' || v == null ? '—' : String(v)
}

function diffSummary(before: Record<string, unknown>, patch: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (JSON.stringify(before[k]) === JSON.stringify(v)) continue
    parts.push(`${LABELS[k] ?? k}: ${show(before[k])} → ${show(v)}`)
  }
  return parts.join(' · ')
}

let logSeq = 0
function entry(e: Omit<ChangeEntry, 'id' | 'at'>): ChangeEntry {
  return { ...e, id: `c${Date.now()}-${logSeq++}`, at: Date.now() }
}

/* -------------------------------------------------------------------- store */

interface StoreValue {
  /** The dataset scoped to the selected subteam. */
  ds: Dataset
  subteam: string
  subteams: { code: string; name: string }[]
  setSubteam: (name: string) => void
  /** True in the whole-program view, where a new item has no subteam to go in. */
  isAllTeams: boolean
  updateTask: (id: string, patch: Partial<Task>) => void
  updateMilestone: (id: string, patch: Partial<Milestone>) => void
  updateGoal: (id: string, patch: Partial<Goal>) => void
  createTask: (draft: Partial<Task>) => Task
  createMilestone: (draft: Partial<Milestone>) => Milestone
  createGoal: (draft: Partial<Goal>) => Goal
  remove: (kind: 'task' | 'milestone' | 'goal', id: string) => void
  resetToSource: () => void
  undo: () => void
  canUndo: boolean
  /** Set when a write just happened, so views can flash the changed row. */
  lastTouched: string | null
}

const Ctx = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<Dataset>(load)
  const [subteam, setSubteamState] = useState<string>(() => {
    try {
      return localStorage.getItem(SUBTEAM_KEY) || DEFAULT_SUBTEAM
    } catch {
      return DEFAULT_SUBTEAM
    }
  })
  const ds = useMemo(() => scopeTo(all, subteam), [all, subteam])
  const code = all.subteams.find((s) => s.name === subteam)?.code ?? ''
  const [lastTouched, setLastTouched] = useState<string | null>(null)
  const history = useRef<Dataset[]>([])
  const [canUndo, setCanUndo] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
      } catch {
        /* quota — the app still works for the session */
      }
    }, 120)
    return () => clearTimeout(t)
  }, [all])

  const commit = useCallback((next: Dataset, touched?: string) => {
    setAll((prev) => {
      history.current = [...history.current.slice(-24), prev]
      setCanUndo(true)
      return next
    })
    if (touched) {
      setLastTouched(touched)
      setTimeout(() => setLastTouched((c) => (c === touched ? null : c)), 1400)
    }
  }, [])

  const value = useMemo<StoreValue>(() => {
    const patcher =
      <K extends 'tasks' | 'milestones' | 'goals'>(key: K, kind: 'task' | 'milestone' | 'goal') =>
      (id: string, patch: Record<string, unknown>) => {
        const list = all[key] as { id: string; title: string }[]
        const before = list.find((i) => i.id === id)
        if (!before) return
        const summary = diffSummary(before as Record<string, unknown>, patch)
        if (!summary) return
        const next: Dataset = {
          ...all,
          [key]: list.map((i) => (i.id === id ? { ...i, ...patch } : i)),
          log: [
            entry({ kind, entityId: id, entityTitle: before.title, summary, action: 'updated' }),
            ...all.log,
          ].slice(0, 300),
        } as Dataset
        commit(next, id)
      }

    const creator =
      <T extends { id: string; title: string }>(
        key: 'tasks' | 'milestones' | 'goals',
        kind: 'task' | 'milestone' | 'goal',
        base: (assembly: string) => T,
      ) =>
      (draft: Partial<T> & { assembly?: string }): T => {
        const assembly = draft.assembly ?? ''
        // The assembly code has to come from the subteam on screen, not from
        // the first assembly in the whole workbook.
        const assemblyCode = CODE_BY_ASSEMBLY[assembly] ?? ds.assemblies[0]?.code ?? 'A01'
        const item = {
          ...base(assembly),
          subteam,
          ...draft,
          id: nextId(all, kind, code, assemblyCode),
        } as T
        const next: Dataset = {
          ...all,
          [key]: [...(all[key] as unknown as T[]), item],
          log: [
            entry({
              kind,
              entityId: item.id,
              entityTitle: item.title,
              summary: assembly ? `Created in ${assembly}` : 'Created',
              action: 'created',
            }),
            ...all.log,
          ].slice(0, 300),
        } as Dataset
        commit(next, item.id)
        return item
      }

    return {
      ds,
      subteam,
      isAllTeams: subteam === ALL_TEAMS,
      subteams: all.subteams,
      setSubteam: (name: string) => {
        setSubteamState(name)
        try {
          localStorage.setItem(SUBTEAM_KEY, name)
        } catch {
          /* private mode — the choice just will not survive a reload */
        }
      },
      lastTouched,
      canUndo,
      updateTask: patcher('tasks', 'task'),
      updateMilestone: patcher('milestones', 'milestone'),
      updateGoal: patcher('goals', 'goal'),
      createTask: creator<Task>('tasks', 'task', (assembly) => ({
        id: '',
        subteam,
        title: 'Untitled task',
        assembly: assembly || ds.assemblies[0]?.name || '',
        assemblyCode: CODE_BY_ASSEMBLY[assembly] ?? ds.assemblies[0]?.code ?? '',
        start: '',
        due: '',
        status: 'Not Started',
        milestoneId: '',
        owners: [],
        priority: '',
        dependsOn: [],
        deliverable: '',
        notes: '',
      })),
      createMilestone: creator<Milestone>('milestones', 'milestone', () => ({
        id: '',
        subteam,
        title: 'Untitled milestone',
        start: '',
        due: '',
        status: 'Not Started',
        goalIds: [],
        dependsOn: [],
        notes: '',
      })),
      createGoal: creator<Goal>('goals', 'goal', () => ({
        id: '',
        subteam,
        title: 'Untitled goal',
        status: 'On Track',
        successMetric: '',
        notes: '',
      })),
      remove: (kind, id) => {
        const key = (kind + 's') as 'tasks' | 'milestones' | 'goals'
        const list = all[key] as { id: string; title: string }[]
        const victim = list.find((i) => i.id === id)
        if (!victim) return
        const next: Dataset = {
          ...all,
          [key]: list.filter((i) => i.id !== id),
          // Clear inbound references so nothing points at a ghost.
          tasks:
            kind === 'task'
              ? all.tasks.filter((t) => t.id !== id)
              : all.tasks.map((t) => ({
                  ...t,
                  milestoneId: kind === 'milestone' && t.milestoneId === id ? '' : t.milestoneId,
                  dependsOn: t.dependsOn.filter((d) => d !== id),
                })),
          milestones:
            kind === 'milestone'
              ? all.milestones.filter((m) => m.id !== id)
              : all.milestones.map((m) => ({
                  ...m,
                  goalIds: m.goalIds.filter((g) => g !== id),
                })),
          log: [
            entry({
              kind,
              entityId: id,
              entityTitle: victim.title,
              summary: 'Deleted',
              action: 'deleted',
            }),
            ...all.log,
          ].slice(0, 300),
        } as Dataset
        commit(next)
      },
      resetToSource: () => commit(freshDataset()),
      undo: () => {
        const prev = history.current.pop()
        if (!prev) return
        setAll(prev)
        setCanUndo(history.current.length > 0)
      },
    }
  }, [all, ds, subteam, code, commit, lastTouched, canUndo])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside <StoreProvider>')
  return v
}
