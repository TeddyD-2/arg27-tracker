import { useMemo } from 'react'
import { useStore } from '../lib/store'
import {
  attentionScore,
  blockedChains,
  completenessScore,
  findIssues,
  healthOf,
  isDone,
  progressOf,
  rollupGoal,
  rollupGroups,
} from '../lib/derive'
import { daysBetween, fmtDay, parseDay, relativeDays, today } from '../lib/dates'
import { GROUP_LABEL, PRIORITIES, PRIORITY_COLOR, STATUS_COLOR } from '../lib/types'
import {
  Button,
  Card,
  cx,
  EmptyState,
  GoalStatusChip,
  PriorityChip,
  ProgressBar,
  StatusChip,
  AssemblyChip,
  Tag,
} from '../components/ui'
import { StatusLegend, StatusStack } from '../components/charts'
import { IconAlert, IconCheck, IconChevron, IconClock } from '../components/icons'
import type { DrawerTarget } from '../components/ItemDrawer'
import type { Route } from '../lib/router'
import { Timeline } from './Timeline'

export function Dashboard({
  onOpenItem,
  onNavigate,
}: {
  onOpenItem: (t: DrawerTarget) => void
  onNavigate: (r: Route) => void
}) {
  const { ds } = useStore()
  const now = today()

  const stats = useMemo(() => {
    const active = ds.tasks.filter((t) => !isDone(t))
    const overdue = active.filter((t) => healthOf(t, now).band === 'overdue')
    const dueSoon = active.filter((t) => healthOf(t, now).band === 'due-soon')
    const blocked = ds.tasks.filter((t) => t.status === 'Blocked')
    return {
      progress: progressOf(ds.tasks),
      overdue,
      dueSoon,
      blocked,
      completeness: completenessScore(ds),
      issues: findIssues(ds, now),
    }
  }, [ds, now])

  const goalRollups = useMemo(
    () =>
      ds.goals
        .map((g) => rollupGoal(g, ds, now))
        .sort((a, b) => b.overdue - a.overdue || a.progress - b.progress),
    [ds, now],
  )

  const groups = useMemo(() => rollupGroups(ds, now), [ds, now])

  const attention = useMemo(
    () =>
      ds.tasks
        .filter((t) => !isDone(t))
        .map((t) => ({ t, score: attentionScore(t, now) }))
        .filter((x) => x.score >= 25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    [ds, now],
  )

  const upcoming = useMemo(() => {
    const horizon = 45
    const items = [
      ...ds.milestones.map((m) => ({ ...m, kind: 'milestone' as const })),
      ...ds.tasks.map((t) => ({ ...t, kind: 'task' as const })),
    ]
      .filter((i) => i.due && !isDone(i))
      .map((i) => ({ i, d: daysBetween(now, parseDay(i.due)!) }))
      .filter((x) => x.d >= -14 && x.d <= horizon)
      .sort((a, b) => a.d - b.d)
    return items.slice(0, 10)
  }, [ds, now])

  const stuck = useMemo(() => blockedChains(ds).slice(0, 5), [ds])

  return (
    <div className="fade-in">
      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Timeline onOpenItem={onOpenItem} />
        </div>

        <Card
          className="h-full"
          title="Work by status"
          subtitle={`${ds.tasks.length} tasks · ${ds.milestones.length} milestones`}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
              Task completion
            </span>
            <span className="tnum text-[11px] text-muted">
              {ds.tasks.filter(isDone).length} of {ds.tasks.length} complete
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex items-baseline gap-1">
              <span className="text-[27px] leading-none font-semibold tracking-tight text-ink">
                {Math.round(stats.progress * 100)}
              </span>
              <span className="text-sm text-muted">%</span>
            </span>
            <ProgressBar value={stats.progress} height={6} color={STATUS_COLOR['In Progress']} />
          </div>

          <div className="mt-5 mb-2 border-t border-hairline pt-4 text-[11px] font-medium tracking-wide text-muted uppercase">
            Tasks
          </div>
          <StatusStack items={ds.tasks} height={12} />
          <div className="mt-3 mb-5">
            <StatusLegend items={ds.tasks} />
          </div>
          <div className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">
            Milestones
          </div>
          <StatusStack items={ds.milestones} height={12} />
          <div className="mt-3">
            <StatusLegend items={ds.milestones} />
          </div>

          <div className="mt-5 border-t border-hairline pt-4">
            <div className="mb-2.5 text-[11px] font-medium tracking-wide text-muted uppercase">
              Open work by priority
            </div>
            <ul className="space-y-2">
              {PRIORITIES.map((p) => {
                const n = ds.tasks.filter((t) => !isDone(t) && t.priority === p).length
                const max = Math.max(
                  1,
                  ...PRIORITIES.map(
                    (x) => ds.tasks.filter((t) => !isDone(t) && t.priority === x).length,
                  ),
                )
                return (
                  <li key={p} className="flex items-center gap-2.5">
                    <span className="w-14 shrink-0 text-[11px] text-ink-2">{p}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(n / max) * 100}%`, background: PRIORITY_COLOR[p] }}
                      />
                    </div>
                    <span className="tnum w-6 shrink-0 text-right text-[11px] text-ink">{n}</span>
                  </li>
                )
              })}
              <li className="flex items-center gap-2.5">
                <span className="w-14 shrink-0 text-[11px] text-warn">Unset</span>
                <span className="flex-1 text-[11px] text-muted">
                  {ds.tasks.filter((t) => !isDone(t) && !t.priority).length} open tasks have no
                  priority
                </span>
              </li>
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          title="Needs attention"
          subtitle="Ranked by lateness, priority and blockers"
          action={
            <Button size="sm" onClick={() => onNavigate({ view: 'tasks' })}>
              All tasks
            </Button>
          }
          pad={false}
        >
          {attention.length ? (
            <ul className="divide-y divide-hairline">
              {attention.map(({ t, score }) => {
                const h = healthOf(t, now)
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => onOpenItem({ kind: 'task', id: t.id })}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span
                        className="w-8 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-semibold tnum"
                        style={{
                          color: score > 60 ? '#d03b3b' : score > 40 ? '#fab219' : '#aab2bd',
                          background:
                            score > 60
                              ? 'rgba(208,59,59,.14)'
                              : score > 40
                                ? 'rgba(250,178,25,.12)'
                                : 'transparent',
                        }}
                        title="Attention score"
                      >
                        {score}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{t.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span className="tnum">{t.id}</span>
                          {t.owners.length ? (
                            <span className="truncate">{t.owners.join(', ')}</span>
                          ) : (
                            <span className="text-warn">unassigned</span>
                          )}
                          {t.due && (
                            <span className={h.band === 'overdue' ? 'text-st-blocked' : ''}>
                              {relativeDays(t.due, now)}
                            </span>
                          )}
                        </span>
                      </span>
                      <PriorityChip priority={t.priority} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<IconCheck className="size-6" />}
              title="Nothing urgent"
              hint="No overdue, blocked, or imminent critical work."
            />
          )}
        </Card>

        <Card title="Next 45 days" subtitle="Milestones and tasks coming due" pad={false}>
          {upcoming.length ? (
            <ul className="divide-y divide-hairline">
              {upcoming.map(({ i, d }) => (
                <li key={`${i.kind}:${i.id}`}>
                  <button
                    onClick={() => onOpenItem({ kind: i.kind, id: i.id })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span
                      className={cx(
                        'tnum w-11 shrink-0 text-right text-[11px] font-semibold',
                        d < 0 ? 'text-st-blocked' : d <= 7 ? 'text-warn' : 'text-muted',
                      )}
                    >
                      {fmtDay(i.due)}
                    </span>
                    <span
                      className="h-6 w-px shrink-0"
                      style={{ background: i.kind === 'milestone' ? '#e0463c' : '#2b323c' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{i.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        {i.kind === 'milestone' ? (
                          <span className="text-brand">Milestone</span>
                        ) : (
                          <span>{i.assembly || '—'}</span>
                        )}
                      </span>
                    </span>
                    <StatusChip status={i.status} size="xs" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<IconClock className="size-6" />} title="Nothing due in the next 45 days" />
          )}
        </Card>

        <Card title="Dependency stalls" subtitle="Work whose blockers are still open" pad={false}>
          {stuck.length ? (
            <ul className="divide-y divide-hairline">
              {stuck.map(({ task, blockers }) => (
                <li key={task.id} className="px-4 py-2.5">
                  <button
                    onClick={() => onOpenItem({ kind: 'task', id: task.id })}
                    className="block w-full text-left"
                  >
                    <span className="block truncate text-[13px] text-ink">{task.title}</span>
                    <span className="tnum text-[11px] text-muted">{task.id}</span>
                  </button>
                  <ul className="mt-1.5 space-y-1">
                    {blockers.map((b) => (
                      <li key={b.id} className="flex items-center gap-2 text-[11px]">
                        <IconAlert className="size-3 shrink-0 text-warn" />
                        <button
                          onClick={() => onOpenItem({ kind: 'task', id: b.id })}
                          className="min-w-0 flex-1 truncate text-left text-ink-2 hover:text-ink"
                        >
                          <span className="tnum mr-1.5 text-muted">{b.id}</span>
                          {b.title}
                        </button>
                        <StatusChip status={b.status} size="xs" />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<IconCheck className="size-6" />}
              title="No stalled chains"
              hint="Every task with a dependency has its blockers complete."
            />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card
          title="Goals"
          subtitle="Progress rolled up from the linked tasks and milestones"
          action={
            <Button size="sm" onClick={() => onNavigate({ view: 'goals' })}>
              All goals
            </Button>
          }
          pad={false}
        >
          <ul className="divide-y divide-hairline">
            {goalRollups.slice(0, 8).map((r) => (
              <li key={r.goal.id}>
                <button
                  onClick={() => onOpenItem({ kind: 'goal', id: r.goal.id })}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {r.goal.title}
                    </span>
                    <GoalStatusChip status={r.goal.status} />
                    <span className="tnum w-9 text-right text-xs text-ink-2">
                      {Math.round(r.progress * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar
                      value={r.progress}
                      height={5}
                      color={r.overdue ? STATUS_COLOR.Blocked : STATUS_COLOR['In Progress']}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <span>
                      {r.tasks.length} tasks · {r.milestones.length} milestones
                    </span>
                    {r.overdue > 0 && <Tag tone="danger">{r.overdue} overdue</Tag>}
                    {!r.tasks.length && !r.milestones.length && <Tag tone="warn">no work linked</Tag>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title={GROUP_LABEL[ds.groupBy].many}
          subtitle="Task load and state, largest first"
          action={
            <Button size="sm" onClick={() => onNavigate({ view: 'people' })}>
              Team load
            </Button>
          }
          pad={false}
        >
          <ul className="divide-y divide-hairline">
            {groups.map((s) => (
              <li key={s.name} className="px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <AssemblyChip name={s.name} code={s.code} />
                  <span className="flex-1" />
                  {s.overdue > 0 && <Tag tone="danger">{s.overdue} overdue</Tag>}
                  {s.unassigned > 0 && <Tag tone="warn">{s.unassigned} unowned</Tag>}
                  <span className="tnum w-9 text-right text-xs text-ink-2">
                    {Math.round(s.progress * 100)}%
                  </span>
                </div>
                <StatusStack items={s.tasks} height={8} />
                <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                  <span>{s.tasks.length} tasks</span>
                  <span>{s.milestones.length} milestones</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {ds.log.length > 0 && (
        <Card className="mt-4" title="Recent activity" pad={false}>
          <ul className="divide-y divide-hairline">
            {ds.log.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <span className="tnum w-16 shrink-0 text-[11px] text-muted">
                  {new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => onOpenItem({ kind: l.kind, id: l.entityId })}
                  className="min-w-0 flex-1 truncate text-left text-ink-2 hover:text-ink"
                >
                  <span className="tnum mr-2 text-muted">{l.entityId}</span>
                  {l.entityTitle}
                </button>
                <span className="hidden truncate text-[11px] text-muted sm:block sm:max-w-xs">
                  {l.summary}
                </span>
                <IconChevron className="size-3 text-muted" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
