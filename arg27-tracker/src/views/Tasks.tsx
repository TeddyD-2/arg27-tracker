import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { attentionScore, healthOf, isDone, statusOf } from '../lib/derive'
import { fmtDay, relativeDays, today } from '../lib/dates'
import {
  groupCode,
  GROUP_LABEL,
  groupOf,
  PRIORITIES,
  PRIORITY_RANK,
  STATUS_COLOR,
  STATUS_STACK_ORDER,
  STATUSES,
  type Priority,
  type Status,
  type Task,
} from '../lib/types'
import {
  Button,
  Card,
  cx,
  EmptyState,
  InlineEdit,
  PageHeader,
  PriorityChip,
  SearchInput,
  Segmented,
  Select,
  AssemblyChip,
  Tag,
} from '../components/ui'
import { StatusLegend, StatusStack } from '../components/charts'
import { IconBoard, IconGrid, IconPlus } from '../components/icons'
import type { DrawerTarget } from '../components/ItemDrawer'

type SortKey = 'attention' | 'due' | 'priority' | 'id' | 'title' | 'status' | 'owner'

const DUE_FILTERS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Due this week' },
  { value: 'fortnight', label: 'Due in 14 days' },
  { value: 'month', label: 'Due in 30 days' },
  { value: 'none', label: 'No due date' },
]

export function Tasks({
  onOpenItem,
  focusId,
}: {
  onOpenItem: (t: DrawerTarget) => void
  focusId?: string
}) {
  const { ds, subteam, isAllTeams, updateTask, createTask, lastTouched } = useStore()
  const now = today()

  const [q, setQ] = useState('')
  const [assembly, setAssembly] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [milestoneId, setMilestoneId] = useState('')
  const [dueBand, setDueBand] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [sort, setSort] = useState<SortKey>('attention')
  const [asc, setAsc] = useState(false)
  const [mode, setMode] = useState<'table' | 'board'>('table')

  // Deep link (#/tasks/SU001) opens the drawer straight onto that task.
  useEffect(() => {
    if (focusId && ds.tasks.some((t) => t.id === focusId)) onOpenItem({ kind: 'task', id: focusId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const owners = useMemo(
    () => [...new Set(ds.tasks.flatMap((t) => t.owners))].sort((a, b) => a.localeCompare(b)),
    [ds.tasks],
  )
  const assemblies = useMemo(
    () => [...new Set(ds.tasks.map((t) => groupOf(ds, t)).filter(Boolean))].sort(),
    [ds],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ds.tasks.filter((t) => {
      if (hideDone && isDone(t)) return false
      if (assembly && groupOf(ds, t) !== assembly) return false
      if (owner && !t.owners.includes(owner)) return false
      if (status && statusOf(t) !== status) return false
      if (priority && t.priority !== priority) return false
      if (milestoneId && t.milestoneId !== milestoneId) return false
      if (dueBand) {
        const h = healthOf(t, now)
        if (dueBand === 'none' && t.due) return false
        if (dueBand === 'overdue' && (h.band !== 'overdue' || isDone(t))) return false
        if (dueBand === 'week' && !(h.daysToDue !== null && h.daysToDue >= 0 && h.daysToDue <= 7))
          return false
        if (dueBand === 'fortnight' && !(h.daysToDue !== null && h.daysToDue >= 0 && h.daysToDue <= 14))
          return false
        if (dueBand === 'month' && !(h.daysToDue !== null && h.daysToDue >= 0 && h.daysToDue <= 30))
          return false
      }
      if (needle) {
        const hay = [t.id, t.title, t.assembly, t.deliverable, t.notes, ...t.owners]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [ds, q, assembly, owner, status, priority, milestoneId, dueBand, hideDone, now])

  const sorted = useMemo(() => {
    const val = (t: Task): number | string => {
      switch (sort) {
        case 'attention':
          return attentionScore(t, now)
        // Undated work sorts to the end regardless of direction.
        case 'due':
          return t.due || '9999-99-99'
        case 'priority':
          return t.priority ? PRIORITY_RANK[t.priority] : 99
        case 'status':
          return STATUS_STACK_ORDER.indexOf(statusOf(t))
        case 'owner':
          return t.owners[0]?.toLowerCase() ?? 'zzz'
        case 'title':
          return t.title.toLowerCase()
        default:
          return t.id
      }
    }
    const out = [...filtered].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      return av < bv ? -1 : av > bv ? 1 : a.id.localeCompare(b.id)
    })
    return asc ? out : out.reverse()
  }, [filtered, sort, asc, now])

  const activeFilters =
    [assembly, owner, status, priority, milestoneId, dueBand].filter(Boolean).length + (hideDone ? 1 : 0)

  const clearAll = () => {
    setAssembly('')
    setOwner('')
    setStatus('')
    setPriority('')
    setMilestoneId('')
    setDueBand('')
    setHideDone(false)
    setQ('')
  }

  const header = (key: SortKey, label: string, className?: string) => (
    <th
      className={cx('px-3 py-2 text-left text-[11px] font-medium tracking-wide text-muted uppercase', className)}
    >
      <button
        onClick={() => {
          if (sort === key) setAsc((a) => !a)
          else {
            setSort(key)
            setAsc(key !== 'attention')
          }
        }}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {label}
        {sort === key && <span className="text-brand">{asc ? '↑' : '↓'}</span>}
      </button>
    </th>
  )

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description={`Every assignment on the ${subteam} task page. Edit inline, or open a row for the full record.`}
        action={
          <div className="flex items-center gap-2">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'table', label: <IconGrid className="size-3.5" />, title: 'Table' },
                { value: 'board', label: <IconBoard className="size-3.5" />, title: 'Board' },
              ]}
            />
            <Button
              variant="primary"
              disabled={isAllTeams}
              title={isAllTeams ? 'Pick a subteam to add a task to it' : undefined}
              onClick={() =>
                onOpenItem({
                  kind: 'task',
                  id: createTask({ assembly: assembly || undefined, priority: priority || '' }).id,
                })
              }
            >
              <IconPlus className="size-3.5" />
              New task
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search tasks, owners, deliverables…" className="min-w-56 flex-1" />
          <Select
            value={assembly}
            onChange={(e) => setAssembly(e.target.value)}
            placeholder={GROUP_LABEL[ds.groupBy].all}
            className="w-auto"
            options={assemblies.map((s) => ({ value: s, label: `${groupCode(ds, s)} · ${s}` }))}
          />
          <Select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Anyone"
            options={owners.map((o) => ({ value: o, label: o }))}
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | '')}
            placeholder="Any status"
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority | '')}
            placeholder="Any priority"
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
          <Select
            value={dueBand}
            onChange={(e) => setDueBand(e.target.value)}
            placeholder="Any date"
            options={DUE_FILTERS}
          />
          <Select
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            placeholder="Any milestone"
            options={ds.milestones.map((m) => ({ value: m.id, label: `${m.id} · ${m.title}` }))}
          />
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="size-3.5 accent-[#e0463c]"
            />
            Hide complete
          </label>
          {activeFilters > 0 && (
            <Button size="sm" variant="subtle" onClick={clearAll}>
              Clear {activeFilters}
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-hairline pt-3">
          <span className="tnum text-xs text-muted">
            <span className="font-semibold text-ink">{sorted.length}</span> of {ds.tasks.length} tasks
          </span>
          <div className="min-w-40 flex-1">
            <StatusStack items={filtered} height={8} onSelect={(s) => setStatus(status === s ? '' : s)} active={status || null} />
          </div>
          <StatusLegend items={filtered} onSelect={(s) => setStatus(status === s ? '' : s)} active={status || null} />
        </div>
      </Card>

      {!sorted.length ? (
        <Card>
          <EmptyState title="No tasks match these filters" hint="Try clearing a filter or widening the search." />
        </Card>
      ) : mode === 'board' ? (
        <Board tasks={sorted} onOpenItem={onOpenItem} lastTouched={lastTouched} />
      ) : (
        <Card pad={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            {/* Fixed layout + a colgroup: every column keeps the width declared
                here and the Task column absorbs the remainder, so long titles
                truncate instead of shoving the grid around. */}
            <table className="w-full min-w-[980px] table-fixed border-collapse">
              <colgroup>
                <col style={{ width: 74 }} />
                <col />
                <col style={{ width: 124 }} />
                <col style={{ width: 148 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 168 }} />
              </colgroup>
              <thead className="border-b border-hairline bg-surface-2/60">
                <tr>
                  {header('id', 'ID')}
                  {header('title', 'Task')}
                  {header('status', 'Status')}
                  {header('owner', 'Owner')}
                  {header('priority', 'Priority')}
                  {header('due', 'Due')}
                  <th className="px-3 py-2 text-left text-[11px] font-medium tracking-wide text-muted uppercase">
                    Milestone
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sorted.map((t) => {
                  const h = healthOf(t, now)
                  const milestone = ds.milestones.find((m) => m.id === t.milestoneId)
                  return (
                    <tr
                      key={t.id}
                      className={cx(
                        'group transition-colors hover:bg-surface-2',
                        lastTouched === t.id && 'bg-brand/8',
                      )}
                    >
                      <td className="px-3 py-2">
                        <button
                          onClick={() => onOpenItem({ kind: 'task', id: t.id })}
                          className="tnum text-xs font-semibold whitespace-nowrap text-muted hover:text-brand"
                        >
                          {t.id}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <InlineEdit
                            value={t.title}
                            onCommit={(title) => updateTask(t.id, { title })}
                            className="min-w-0 flex-1 truncate text-[13px] text-ink"
                          />
                          <AssemblyChip name={t.assembly} code={t.assemblyCode || '??'} />
                          {t.dependsOn.length > 0 && (
                            <span className="text-[11px] text-muted" title={`Depends on ${t.dependsOn.join(', ')}`}>
                              ⛓ {t.dependsOn.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {/* Inline status change — the single most common edit. */}
                        <select
                          value={t.status}
                          onChange={(e) => updateTask(t.id, { status: e.target.value as Status })}
                          className="w-full cursor-pointer appearance-none rounded-md border border-transparent bg-transparent px-0 py-0.5 text-[11px] hover:border-hairline focus:border-brand focus:outline-none"
                          style={{ color: STATUS_COLOR[statusOf(t)] }}
                          aria-label={`Status of ${t.id}`}
                        >
                          {!t.status && <option value="">Unset</option>}
                          {STATUSES.map((s) => (
                            <option key={s} value={s} className="bg-surface-2 text-ink">
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {t.owners.length ? (
                          <span className="block truncate text-xs text-ink-2" title={t.owners.join(', ')}>
                            {t.owners.join(', ')}
                          </span>
                        ) : (
                          <span className="text-xs text-warn">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <PriorityChip priority={t.priority} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {t.due ? (
                          <span
                            className={cx(
                              'tnum text-xs',
                              isDone(t)
                                ? 'text-muted'
                                : h.band === 'overdue'
                                  ? 'font-medium text-st-blocked'
                                  : h.band === 'due-soon'
                                    ? 'text-warn'
                                    : 'text-ink-2',
                            )}
                            title={relativeDays(t.due, now) ?? undefined}
                          >
                            {fmtDay(t.due)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {milestone ? (
                          <span className="block truncate text-xs text-ink-2" title={milestone.title}>
                            {milestone.title}
                          </span>
                        ) : (
                          <Tag tone="warn">unlinked</Tag>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- board */

function Board({
  tasks,
  onOpenItem,
  lastTouched,
}: {
  tasks: Task[]
  onOpenItem: (t: DrawerTarget) => void
  lastTouched: string | null
}) {
  const { updateTask } = useStore()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)
  const now = today()

  const columns = STATUS_STACK_ORDER.map((s) => ({
    status: s,
    items: tasks.filter((t) => statusOf(t) === s),
  }))

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {columns.map(({ status, items }) => (
        <div
          key={status}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(status)
          }}
          onDragLeave={() => setOver((o) => (o === status ? null : o))}
          onDrop={() => {
            if (dragging) updateTask(dragging, { status })
            setDragging(null)
            setOver(null)
          }}
          className={cx(
            'flex w-[268px] shrink-0 flex-col rounded-xl border bg-surface transition-colors',
            over === status ? 'border-brand/60 bg-surface-2' : 'border-hairline',
          )}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
            <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
            <span className="text-[13px] font-medium text-ink">{status}</span>
            <span className="tnum ml-auto rounded bg-surface-3 px-1.5 text-[11px] text-muted">
              {items.length}
            </span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 340px)' }}>
            {items.map((t) => {
              const h = healthOf(t, now)
              return (
                <article
                  key={t.id}
                  draggable
                  onDragStart={() => setDragging(t.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpenItem({ kind: 'task', id: t.id })}
                  className={cx(
                    'cursor-pointer rounded-lg border border-hairline bg-surface-2 p-2.5 transition-colors hover:border-surface-3',
                    dragging === t.id && 'opacity-40',
                    lastTouched === t.id && 'border-brand/50',
                  )}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="tnum text-[10px] font-semibold text-muted">{t.id}</span>
                    <span className="flex-1" />
                    <PriorityChip priority={t.priority} />
                  </div>
                  <p className="text-[13px] leading-snug text-ink">{t.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <AssemblyChip name={t.assembly} code={t.assemblyCode || '??'} />
                    {t.due && (
                      <span
                        className={cx(
                          'tnum',
                          h.band === 'overdue' && !isDone(t)
                            ? 'text-st-blocked'
                            : h.band === 'due-soon'
                              ? 'text-warn'
                              : '',
                        )}
                      >
                        {fmtDay(t.due)}
                      </span>
                    )}
                    {t.owners.length > 0 && <span className="truncate">{t.owners[0]}</span>}
                  </div>
                </article>
              )
            })}
            {!items.length && (
              <p className="px-2 py-6 text-center text-[11px] text-muted">Drop a task here</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
