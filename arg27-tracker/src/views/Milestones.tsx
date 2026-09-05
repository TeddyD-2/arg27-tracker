import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { healthOf, isDone, rollupMilestone } from '../lib/derive'
import { fmtDayYear, parseDay, relativeDays, today } from '../lib/dates'
import { STATUS_COLOR, STATUSES, type Status } from '../lib/types'
import {
  Button,
  Card,
  cx,
  EmptyState,
  PageHeader,
  ProgressBar,
  SearchInput,
  Segmented,
  Select,
  StatusChip,
  Tag,
} from '../components/ui'
import { StatusStack } from '../components/charts'
import { IconMilestone, IconPlus } from '../components/icons'
import type { DrawerTarget } from '../components/ItemDrawer'

const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

export function Milestones({
  onOpenItem,
  focusId,
}: {
  onOpenItem: (t: DrawerTarget) => void
  focusId?: string
}) {
  const { ds, subteam, isAllTeams, createMilestone } = useStore()
  const now = today()
  const [q, setQ] = useState('')
  const [goalId, setGoalId] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [group, setGroup] = useState<'month' | 'goal'>('month')

  useEffect(() => {
    if (focusId && ds.milestones.some((m) => m.id === focusId))
      onOpenItem({ kind: 'milestone', id: focusId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const goalTitle = useMemo(
    () => new Map(ds.goals.map((g) => [g.id, g.title])),
    [ds.goals],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ds.milestones.filter((m) => {
      if (goalId && !m.goalIds.includes(goalId)) return false
      if (status && (m.status || 'Not Started') !== status) return false
      if (needle && !`${m.id} ${m.title} ${m.notes}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [ds.milestones, q, goalId, status])

  /** Undated milestones get their own trailing bucket rather than being dropped. */
  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const m of filtered) {
      let key: string
      if (group === 'goal')
        key = m.goalIds.length
          ? m.goalIds.map((g) => goalTitle.get(g) ?? g).join(' · ')
          : 'No goal linked'
      else {
        const d = parseDay(m.due)
        key = d ? MONTH_FMT.format(d) : 'No date set'
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    const entries = [...map.entries()]
    if (group === 'month') {
      entries.sort(([a, ax], [b, bx]) => {
        if (a === 'No date set') return 1
        if (b === 'No date set') return -1
        return (ax[0].due || '').localeCompare(bx[0].due || '')
      })
      for (const [, list] of entries) list.sort((x, y) => (x.due || '').localeCompare(y.due || ''))
    } else {
      entries.sort(([, a], [, b]) => b.length - a.length)
      for (const [, list] of entries)
        list.sort((x, y) => (x.due || '9999').localeCompare(y.due || '9999'))
    }
    return entries
  }, [filtered, group, goalTitle])

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Work"
        title="Milestones"
        description={`The ${subteam} deadlines the season is built around.`}
        action={
          <Button
            variant="primary"
            disabled={isAllTeams}
            title={isAllTeams ? 'Pick a subteam to add a milestone to it' : undefined}
            onClick={() =>
              onOpenItem({
                kind: 'milestone',
                id: createMilestone({}).id,
              })
            }
          >
            <IconPlus className="size-3.5" />
            New milestone
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search milestones…" className="min-w-56 flex-1" />
          <Select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            placeholder="All goals"
            options={ds.goals.map((g) => ({ value: g.id, label: `${g.id} · ${g.title}` }))}
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | '')}
            placeholder="Any status"
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <Segmented
            value={group}
            onChange={setGroup}
            options={[
              { value: 'month', label: 'By month' },
              { value: 'goal', label: 'By goal' },
            ]}
          />
        </div>
        <div className="mt-3 flex items-center gap-4 border-t border-hairline pt-3">
          <span className="tnum text-xs text-muted">
            <span className="font-semibold text-ink">{filtered.length}</span> of {ds.milestones.length}
          </span>
          <div className="min-w-40 flex-1">
            <StatusStack items={filtered} height={8} />
          </div>
        </div>
      </Card>

      {!groups.length ? (
        <Card>
          <EmptyState title="No milestones match these filters" />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, items]) => (
            <section key={label}>
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-[13px] font-semibold tracking-wide text-ink">{label}</h2>
                <span className="h-px flex-1 bg-hairline" />
                <span className="tnum text-[11px] text-muted">{items.length}</span>
              </div>
              <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                {items.map((m) => {
                  const roll = rollupMilestone(m, ds, now)
                  const h = healthOf(m, now)
                  const overdue = h.band === 'overdue' && !isDone(m)
                  return (
                    <button
                      key={m.id}
                      onClick={() => onOpenItem({ kind: 'milestone', id: m.id })}
                      className={cx(
                        'rounded-xl border bg-surface p-3.5 text-left transition-colors hover:border-surface-3 hover:bg-surface-2',
                        overdue ? 'border-st-blocked/35' : 'border-hairline',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <IconMilestone
                          className="mt-0.5 size-4 shrink-0"
                          // Diamond is the milestone mark; colour repeats the status chip below.
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[14px] font-medium text-ink">{m.title}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            <span className="tnum font-semibold">{m.id}</span>
                            {/* The "no goal" case is called out in the card footer. */}
                            {m.goalIds.map((g) => (
                              <Tag key={g}>{goalTitle.get(g) ?? g}</Tag>
                            ))}
                          </div>
                        </div>
                        <StatusChip status={m.status} size="xs" />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px]">
                        <span className={cx('tnum', overdue ? 'font-medium text-st-blocked' : 'text-ink-2')}>
                          {m.due ? fmtDayYear(m.due) : 'No date set'}
                        </span>
                        <span className={cx(overdue ? 'text-st-blocked' : 'text-muted')}>
                          {relativeDays(m.due, now) ?? '—'}
                        </span>
                      </div>

                      {roll.tasks.length > 0 && (
                        <div className="mt-2.5">
                          <div className="mb-1 flex justify-between text-[11px] text-muted">
                            <span>{roll.tasks.length} supporting tasks</span>
                            <span className="tnum">{Math.round(roll.progress * 100)}%</span>
                          </div>
                          <ProgressBar
                            value={roll.progress}
                            height={4}
                            color={roll.overdue ? STATUS_COLOR.Blocked : STATUS_COLOR['In Progress']}
                          />
                        </div>
                      )}

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {!m.goalIds.length && <Tag tone="warn">no goal</Tag>}
                        {!m.due && <Tag tone="warn">no date</Tag>}
                        {!roll.tasks.length && <Tag>no tasks</Tag>}
                        {m.dependsOn.length > 0 && <Tag>waits on {m.dependsOn.join(', ')}</Tag>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
