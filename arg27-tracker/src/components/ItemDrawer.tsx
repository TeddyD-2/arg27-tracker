import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../lib/store'
import {
  CODE_BY_ASSEMBLY,
  GOAL_STATUSES,
  PRIORITIES,
  STATUSES,
  type Goal,
  type Milestone,
  type Task,
} from '../lib/types'
import { fmtDayYear, fmtRelativeTime, relativeDays } from '../lib/dates'
import { healthOf, isDone, rollupGoal, rollupMilestone } from '../lib/derive'
import {
  Button,
  cx,
  EmptyState,
  GoalStatusChip,
  ProgressBar,
  Select,
  StatusChip,
  AssemblyChip,
  Tag,
  TextArea,
  TextInput,
} from './ui'
import { IconClose, IconLink, IconTask } from './icons'
import { href } from '../lib/router'

export type DrawerTarget = { kind: 'task' | 'milestone' | 'goal'; id: string } | null

/** Multi-word owner entry: a comma-separated text field, kept simple on purpose. */
function OwnersField({ owners, onChange }: { owners: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState(owners.join(', '))
  useEffect(() => setDraft(owners.join(', ')), [owners])
  return (
    <TextInput
      value={draft}
      placeholder="Unassigned"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() =>
        onChange(
          draft
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_1fr] items-start gap-3 py-1.5">
      <div className="pt-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function LinkChip({ id, title, view }: { id: string; title: string; view: 'tasks' | 'milestones' | 'goals' }) {
  return (
    <a
      href={href(view, id)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand/40 hover:text-ink"
    >
      <span className="tnum shrink-0 font-semibold text-muted">{id}</span>
      <span className="truncate">{title}</span>
    </a>
  )
}

export function ItemDrawer({ target, onClose }: { target: DrawerTarget; onClose: () => void }) {
  const { ds, updateTask, updateMilestone, updateGoal, remove } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setConfirmDelete(false)
  }, [target?.id])

  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, onClose])

  const item = useMemo(() => {
    if (!target) return null
    if (target.kind === 'task') return ds.tasks.find((t) => t.id === target.id) ?? null
    if (target.kind === 'milestone') return ds.milestones.find((m) => m.id === target.id) ?? null
    return ds.goals.find((g) => g.id === target.id) ?? null
  }, [ds, target])

  const goalOptions = useMemo(
    () =>
      [...ds.goals]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((g) => ({ value: g.id, label: `${g.id} · ${g.title}` })),
    [ds.goals],
  )

  if (!target) return null

  const body = !item ? (
    <EmptyState title="This item no longer exists" hint="It may have been deleted." />
  ) : target.kind === 'task' ? (
    <TaskBody task={item as Task} />
  ) : target.kind === 'milestone' ? (
    <MilestoneBody milestone={item as Milestone} goalOptions={goalOptions} />
  ) : (
    <GoalBody goal={item as Goal} />
  )

  const kindLabel = target.kind[0].toUpperCase() + target.kind.slice(1)
  const recent = ds.log.filter((l) => l.entityId === target.id).slice(0, 6)

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${kindLabel} ${target.id}`}
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-hairline bg-surface shadow-2xl shadow-black/70"
        style={{ animation: 'slide-in .22s cubic-bezier(.2,.8,.3,1) both' }}
      >
        <style>{`@keyframes slide-in{from{transform:translateX(24px);opacity:0}}`}</style>

        <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="tnum rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                {item?.id ?? target.id}
              </span>
              <span className="text-[11px] tracking-wide text-muted uppercase">{kindLabel}</span>
              {item && 'assembly' in item && item.assembly && (
                <AssemblyChip name={item.assembly} code={CODE_BY_ASSEMBLY[item.assembly] ?? '??'} />
              )}
            </div>
            {item && (
              <h2 className="mt-2 text-lg leading-snug font-semibold text-ink">{item.title}</h2>
            )}
          </div>
          <Button variant="subtle" size="sm" onClick={onClose} aria-label="Close">
            <IconClose className="size-3.5" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {body}

          {recent.length > 0 && (
            <div className="mt-6 border-t border-hairline pt-4">
              <div className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">
                Recent changes
              </div>
              <ul className="space-y-1.5">
                {recent.map((l) => (
                  <li key={l.id} className="flex gap-2 text-xs text-ink-2">
                    <span className="w-14 shrink-0 text-muted">{fmtRelativeTime(l.at)}</span>
                    <span className="min-w-0 flex-1">{l.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {item && (
          <footer className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
            <span className="text-[11px] text-muted">Changes save as you type</span>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-2">Delete {item.id}?</span>
                <Button size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    remove(target.kind, target.id)
                    onClose()
                  }}
                >
                  Delete
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </footer>
        )}
      </div>
    </>,
    document.body,
  )

  /* ------------------------------------------------------------- sub-bodies */

  function TaskBody({ task }: { task: Task }) {
    const set = (patch: Partial<Task>) => updateTask(task.id, patch)
    const h = healthOf(task)
    const milestone = ds.milestones.find((m) => m.id === task.milestoneId)
    const blockers = task.dependsOn.map((d) => ds.tasks.find((t) => t.id === d)).filter(Boolean) as Task[]
    const blocking = ds.tasks.filter((t) => t.dependsOn.includes(task.id))

    return (
      <div className="space-y-1">
        <Row label="Title">
          <TextInput value={task.title} onChange={(e) => set({ title: e.target.value })} />
        </Row>
        <Row label="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => set({ status: s })}
                className={cx(
                  'rounded-md transition-transform',
                  task.status === s ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100',
                )}
              >
                <StatusChip status={s} />
              </button>
            ))}
          </div>
        </Row>
        <Row label="Priority">
          <Select
            value={task.priority}
            placeholder="No priority"
            onChange={(e) => set({ priority: e.target.value as Task['priority'] })}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
        </Row>
        <Row label="Owners">
          <OwnersField owners={task.owners} onChange={(owners) => set({ owners })} />
        </Row>
        <Row label="Assembly">
          <Select
            value={task.assembly}
            placeholder="Unassigned"
            onChange={(e) =>
              set({ assembly: e.target.value, assemblyCode: CODE_BY_ASSEMBLY[e.target.value] ?? '' })
            }
            options={ds.assemblies.map((a) => ({ value: a.name, label: `${a.code} · ${a.name}` }))}
          />
        </Row>
        <Row label="Dates">
          <div className="flex items-center gap-2">
            <TextInput type="date" value={task.start} onChange={(e) => set({ start: e.target.value })} />
            <span className="text-muted">→</span>
            <TextInput type="date" value={task.due} onChange={(e) => set({ due: e.target.value })} />
          </div>
          {task.due && (
            <p
              className={cx(
                'mt-1.5 text-[11px]',
                h.band === 'overdue' && !isDone(task)
                  ? 'text-st-blocked'
                  : h.band === 'due-soon'
                    ? 'text-warn'
                    : 'text-muted',
              )}
            >
              Due {fmtDayYear(task.due)} · {relativeDays(task.due)}
            </p>
          )}
        </Row>
        <Row label="Milestone">
          <Select
            value={task.milestoneId}
            placeholder="Not linked"
            onChange={(e) => set({ milestoneId: e.target.value })}
            options={ds.milestones.map((m) => ({ value: m.id, label: `${m.id} · ${m.title}` }))}
          />
          {milestone?.due && task.due && task.due > milestone.due && (
            <p className="mt-1 text-[11px] text-st-blocked">
              This task is due after its milestone ({fmtDayYear(milestone.due)}).
            </p>
          )}
        </Row>
        <Row label="Deliverable">
          <TextArea
            rows={2}
            value={task.deliverable}
            placeholder="What must exist for this to be done?"
            onChange={(e) => set({ deliverable: e.target.value })}
          />
        </Row>
        <Row label="Notes">
          <TextArea rows={2} value={task.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Row>

        {(blockers.length > 0 || blocking.length > 0) && (
          <div className="mt-4 border-t border-hairline pt-4">
            {blockers.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                  <IconLink className="size-3.5" /> Waiting on
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {blockers.map((b) => (
                    <LinkChip key={b.id} id={b.id} title={b.title} view="tasks" />
                  ))}
                </div>
              </div>
            )}
            {blocking.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                  Blocking
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {blocking.map((b) => (
                    <LinkChip key={b.id} id={b.id} title={b.title} view="tasks" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  function MilestoneBody({
    milestone,
    goalOptions,
  }: {
    milestone: Milestone
    goalOptions: { value: string; label: string }[]
  }) {
    const set = (patch: Partial<Milestone>) => updateMilestone(milestone.id, patch)
    const roll = rollupMilestone(milestone, ds)

    return (
      <div className="space-y-1">
        <Row label="Title">
          <TextInput value={milestone.title} onChange={(e) => set({ title: e.target.value })} />
        </Row>
        <Row label="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => set({ status: s })}
                className={cx(
                  'rounded-md transition-transform',
                  milestone.status === s
                    ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface'
                    : 'opacity-70 hover:opacity-100',
                )}
              >
                <StatusChip status={s} />
              </button>
            ))}
          </div>
        </Row>
        <Row label="Due">
          <TextInput type="date" value={milestone.due} onChange={(e) => set({ due: e.target.value })} />
          {milestone.due && (
            <p className="mt-1.5 text-[11px] text-muted">
              {fmtDayYear(milestone.due)} · {relativeDays(milestone.due)}
            </p>
          )}
        </Row>
        <Row label="Goals">
          <div className="space-y-1.5">
            {milestone.goalIds.map((gid) => {
              const g = ds.goals.find((x) => x.id === gid)
              return (
                <div key={gid} className="flex items-center gap-2">
                  <LinkChip id={gid} title={g?.title ?? 'missing'} view="goals" />
                  <button
                    onClick={() => set({ goalIds: milestone.goalIds.filter((x) => x !== gid) })}
                    className="text-muted hover:text-st-blocked"
                    aria-label={`Unlink ${gid}`}
                  >
                    <IconClose className="size-3" />
                  </button>
                </div>
              )
            })}
            <Select
              value=""
              placeholder="Link a goal…"
              onChange={(e) =>
                e.target.value && set({ goalIds: [...new Set([...milestone.goalIds, e.target.value])] })
              }
              options={goalOptions.filter((o) => !milestone.goalIds.includes(o.value))}
            />
          </div>
        </Row>
        <Row label="Notes">
          <TextArea rows={2} value={milestone.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Row>

        <div className="mt-4 border-t border-hairline pt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
              <IconTask className="size-3.5" /> Supporting tasks ({roll.tasks.length})
            </div>
            <span className="tnum text-xs text-ink-2">{Math.round(roll.progress * 100)}%</span>
          </div>
          <ProgressBar value={roll.progress} className="mb-3" />
          {roll.tasks.length ? (
            <ul className="space-y-1">
              {roll.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                  <LinkChip id={t.id} title={t.title} view="tasks" />
                  <StatusChip status={t.status} size="xs" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">
              No tasks roll up to this milestone yet. Link them from a task’s Milestone field.
            </p>
          )}
        </div>
      </div>
    )
  }

  function GoalBody({ goal }: { goal: Goal }) {
    const set = (patch: Partial<Goal>) => updateGoal(goal.id, patch)
    const roll = rollupGoal(goal, ds)

    return (
      <div className="space-y-1">
        <Row label="Goal">
          <TextInput value={goal.title} onChange={(e) => set({ title: e.target.value })} />
        </Row>
        <Row label="Status">
          <div className="flex flex-wrap gap-1.5">
            {GOAL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => set({ status: s })}
                className={cx(
                  'rounded-md transition-transform',
                  goal.status === s ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100',
                )}
              >
                <GoalStatusChip status={s} />
              </button>
            ))}
          </div>
          {goal.status && goal.status !== roll.computedStatus && roll.computedStatus !== 'Not Started' && (
            <p className="mt-1.5 text-[11px] text-warn">
              The attached work currently reads “{roll.computedStatus}”.
            </p>
          )}
        </Row>
        <Row label="Success metric">
          <TextArea
            rows={2}
            value={goal.successMetric}
            placeholder="What has to be true for this goal to be met?"
            onChange={(e) => set({ successMetric: e.target.value })}
          />
        </Row>
        <Row label="Notes">
          <TextArea rows={2} value={goal.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Row>

        {goal.sheetId && goal.sheetId !== goal.id && (
          <div className="mt-3 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs text-ink-2">
            The Goals sheet files this as <Tag>{goal.sheetId}</Tag>, an ID it shares with a
            milestone. It is re-keyed here so the two never collide.
          </div>
        )}

        <div className="mt-4 border-t border-hairline pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wide text-muted uppercase">Rollup</span>
            <span className="tnum text-xs text-ink-2">{Math.round(roll.progress * 100)}%</span>
          </div>
          <ProgressBar value={roll.progress} className="mb-3" />
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Tag>{roll.tasks.length} tasks</Tag>
            <Tag>{roll.milestones.length} milestones</Tag>
            {roll.overdue > 0 && <Tag tone="danger">{roll.overdue} overdue</Tag>}
            {roll.blocked > 0 && <Tag tone="warn">{roll.blocked} blocked</Tag>}
          </div>
          <ul className="space-y-1">
            {[...roll.milestones, ...roll.tasks].slice(0, 40).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                <LinkChip
                  id={i.id}
                  title={i.title}
                  view={'goalIds' in i ? 'milestones' : 'tasks'}
                />
                <StatusChip status={i.status} size="xs" />
              </li>
            ))}
          </ul>
          {!roll.tasks.length && !roll.milestones.length && (
            <p className="text-xs text-muted">
              Nothing rolls up to this goal yet — it will read 0% until work is linked.
            </p>
          )}
        </div>
      </div>
    )
  }
}
