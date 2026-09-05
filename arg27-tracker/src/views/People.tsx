import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { attentionScore, healthOf, isDone, rollupPeople, rollupGroups } from '../lib/derive'
import { fmtDay, relativeDays, today } from '../lib/dates'
import { groupCode, GROUP_LABEL, STATUS_COLOR } from '../lib/types'
import {
  Card,
  cx,
  EmptyState,
  PageHeader,
  PriorityChip,
  ProgressBar,
  SearchInput,
  Segmented,
  StatusChip,
  AssemblyChip,
  Tag,
} from '../components/ui'
import { StatusLegend, StatusStack, StatTile } from '../components/charts'
import { IconAlert } from '../components/icons'
import type { DrawerTarget } from '../components/ItemDrawer'

export function People({
  onOpenItem,
  focusId,
}: {
  onOpenItem: (t: DrawerTarget) => void
  focusId?: string
}) {
  const { ds } = useStore()
  const now = today()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(focusId ?? null)
  const [lens, setLens] = useState<'people' | 'groups'>('people')

  const people = useMemo(() => rollupPeople(ds, now), [ds, now])
  const groups = useMemo(() => rollupGroups(ds, now), [ds, now])

  const unassigned = useMemo(
    () => ds.tasks.filter((t) => !t.owners.length && !isDone(t)),
    [ds.tasks],
  )

  const filteredPeople = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? people.filter((p) => p.name.toLowerCase().includes(n)) : people
  }, [people, q])

  const active = selected ? people.find((p) => p.name === selected) : null
  const maxLoad = Math.max(1, ...people.map((p) => p.active))

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Team"
        title="Team load"
        description="Who is carrying what. Ownership comes from the Owner column, so anything unowned shows up as a gap rather than disappearing."
        action={
          <Segmented
            value={lens}
            onChange={setLens}
            options={[
              { value: 'people', label: 'People' },
              { value: 'groups', label: GROUP_LABEL[ds.groupBy].many },
            ]}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="People with tasks" value={people.length} hint="named in an Owner cell" />
        <StatTile
          label="Unowned open tasks"
          value={unassigned.length}
          tone={unassigned.length ? 'warn' : 'good'}
          hint="nobody is responsible"
        />
        <StatTile
          label="Busiest load"
          value={maxLoad}
          unit="open"
          hint={people[0]?.name ?? '—'}
        />
        <StatTile
          label="Median load"
          value={
            people.length
              ? [...people.map((p) => p.active)].sort((a, b) => a - b)[Math.floor(people.length / 2)]
              : 0
          }
          unit="open"
          hint="open tasks per person"
        />
      </div>

      {lens === 'groups' ? (
        <Card pad={false}>
          <ul className="divide-y divide-hairline">
            {groups.map((s) => (
              <li key={s.name} className="px-4 py-3.5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <AssemblyChip name={s.name} code={s.code} />
                  <span className="text-[11px] text-muted">
                    {s.tasks.length} tasks · {s.milestones.length} milestones
                  </span>
                  <span className="flex-1" />
                  {s.overdue > 0 && <Tag tone="danger">{s.overdue} overdue</Tag>}
                  {s.blocked > 0 && <Tag tone="warn">{s.blocked} blocked</Tag>}
                  {s.unassigned > 0 && <Tag tone="warn">{s.unassigned} unowned</Tag>}
                  <span className="tnum w-10 text-right text-[13px] font-semibold text-ink">
                    {Math.round(s.progress * 100)}%
                  </span>
                </div>
                <StatusStack items={s.tasks} height={10} />
                <div className="mt-2">
                  <StatusLegend items={s.tasks} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card
            title="Load by person"
            subtitle="Open tasks, ordered by volume"
            action={<SearchInput value={q} onChange={setQ} placeholder="Find someone…" className="w-44" />}
            pad={false}
          >
            {!filteredPeople.length ? (
              <EmptyState title="Nobody matches that search" />
            ) : (
              <ul className="divide-y divide-hairline">
                {filteredPeople.map((p) => (
                  <li key={p.name}>
                    <button
                      onClick={() => setSelected(selected === p.name ? null : p.name)}
                      className={cx(
                        'w-full px-4 py-3 text-left transition-colors hover:bg-surface-2',
                        selected === p.name && 'bg-surface-2',
                      )}
                      aria-expanded={selected === p.name}
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2">
                          {p.name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {p.groups.map((g) => groupCode(ds, g)).join(' · ')}
                          </span>
                        </span>
                        <span className="tnum text-right">
                          <span className="block text-[13px] font-semibold text-ink">{p.active}</span>
                          <span className="block text-[10px] text-muted">open</span>
                        </span>
                      </div>

                      {/* Load bar — one series, so its length is the only encoding. */}
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(p.active / maxLoad) * 100}%`,
                              background: p.overdue ? STATUS_COLOR.Blocked : STATUS_COLOR['In Progress'],
                            }}
                          />
                        </div>
                        <span className="flex shrink-0 gap-1.5">
                          {p.overdue > 0 && <Tag tone="danger">{p.overdue} late</Tag>}
                          {p.critical > 0 && <Tag tone="warn">{p.critical} critical</Tag>}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-4">
            {active ? (
              <Card
                title={active.name}
                subtitle={`${active.tasks.length} tasks · ${Math.round(active.progress * 100)}% weighted complete`}
                pad={false}
              >
                <div className="border-b border-hairline px-4 py-3">
                  <StatusStack items={active.tasks} height={10} />
                  <div className="mt-2">
                    <StatusLegend items={active.tasks} />
                  </div>
                </div>
                <ul className="max-h-[52vh] divide-y divide-hairline overflow-y-auto">
                  {[...active.tasks]
                    .sort((a, b) => attentionScore(b, now) - attentionScore(a, now))
                    .map((t) => {
                      const h = healthOf(t, now)
                      return (
                        <li key={t.id}>
                          <button
                            onClick={() => onOpenItem({ kind: 'task', id: t.id })}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-ink">{t.title}</span>
                              <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                                <span className="tnum">{t.id}</span>
                                <AssemblyChip name={t.assembly} code={t.assemblyCode || '??'} />
                                {t.due && (
                                  <span
                                    className={cx(
                                      'tnum',
                                      h.band === 'overdue' && !isDone(t) ? 'text-st-blocked' : '',
                                    )}
                                  >
                                    {fmtDay(t.due)}
                                  </span>
                                )}
                              </span>
                            </span>
                            <PriorityChip priority={t.priority} />
                            <StatusChip status={t.status} size="xs" />
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </Card>
            ) : (
              <Card title="Select a person" subtitle="Pick someone on the left to see their queue">
                <EmptyState
                  title="No one selected"
                  hint="Their open work, sorted by how much attention it needs, will appear here."
                />
              </Card>
            )}

            {unassigned.length > 0 && (
              <Card
                title="Unowned open tasks"
                subtitle="Nobody is named in the Owner column"
                pad={false}
              >
                <ul className="max-h-72 divide-y divide-hairline overflow-y-auto">
                  {unassigned.slice(0, 60).map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => onOpenItem({ kind: 'task', id: t.id })}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
                      >
                        <IconAlert className="size-3.5 shrink-0 text-warn" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                          <span className="tnum mr-2 text-[11px] text-muted">{t.id}</span>
                          {t.title}
                        </span>
                        {t.due && (
                          <span className="tnum shrink-0 text-[11px] text-muted">
                            {relativeDays(t.due, now)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {unassigned.length > 60 && (
                  <p className="px-4 py-2 text-[11px] text-muted">
                    +{unassigned.length - 60} more
                  </p>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {lens === 'people' && (
        <Card className="mt-4" title="Balance check" subtitle="Relative load across the team">
          <div className="space-y-2">
            {people.map((p) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-xs text-ink-2">{p.name}</span>
                <ProgressBar
                  value={p.active / maxLoad}
                  height={8}
                  color={p.overdue ? STATUS_COLOR.Blocked : STATUS_COLOR['In Progress']}
                />
                <span className="tnum w-8 shrink-0 text-right text-xs text-muted">{p.active}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
