import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { rollupGoal, type GoalRollup } from '../lib/derive'
import { fmtDay, today } from '../lib/dates'
import { STATUS_COLOR } from '../lib/types'
import {
  Button,
  Card,
  cx,
  EmptyState,
  GoalStatusChip,
  PageHeader,
  ProgressBar,
  SearchInput,
  StatusChip,
  Tag,
} from '../components/ui'
import { StatusLegend, StatusStack } from '../components/charts'
import { IconAlert, IconPlus } from '../components/icons'
import type { DrawerTarget } from '../components/ItemDrawer'

export function Goals({
  onOpenItem,
  focusId,
}: {
  onOpenItem: (t: DrawerTarget) => void
  focusId?: string
}) {
  const { ds, subteam, isAllTeams, createGoal } = useStore()
  const now = today()
  const [q, setQ] = useState('')

  useEffect(() => {
    if (focusId && ds.goals.some((g) => g.id === focusId)) onOpenItem({ kind: 'goal', id: focusId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const rollups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ds.goals
      .map((g) => rollupGoal(g, ds, now))
      .filter(
        (r) =>
          !needle ||
          [r.goal.id, r.goal.sheetId ?? '', r.goal.title, r.goal.successMetric]
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
      .sort(
        (a, b) =>
          b.overdue - a.overdue ||
          b.tasks.length + b.milestones.length - (a.tasks.length + a.milestones.length),
      )
  }, [ds, q, now])

  const unlinked = rollups.filter((r) => !r.milestones.length).length

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Work"
        title="Goals"
        description={`${subteam}'s season outcomes. Progress is computed from the milestones linked to each goal and the tasks feeding them — it is never entered by hand.`}
        action={
          <Button
            variant="primary"
            disabled={isAllTeams}
            title={isAllTeams ? 'Pick a subteam to add a goal to it' : undefined}
            onClick={() => onOpenItem({ kind: 'goal', id: createGoal({}).id })}
          >
            <IconPlus className="size-3.5" />
            New goal
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search goals…" className="max-w-xs flex-1" />
      </div>

      {unlinked > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn/6 px-4 py-3">
          <IconAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="text-[13px] text-ink-2">
            {unlinked} of {ds.goals.length} goals have no milestone attached, so nothing rolls up to
            them. The workbook has no column linking the two — open a milestone and set its goal to
            close the gap.
          </p>
        </div>
      )}

      {!rollups.length ? (
        <Card>
          <EmptyState title="No goals match" hint="Try a different search." />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rollups.map((r) => (
            <GoalCard key={r.goal.id} r={r} onOpenItem={onOpenItem} />
          ))}
        </div>
      )}
    </div>
  )
}

function GoalCard({ r, onOpenItem }: { r: GoalRollup; onOpenItem: (t: DrawerTarget) => void }) {
  const items = [...r.milestones, ...r.tasks]
  const pct = Math.round(r.progress * 100)
  const drift = r.goal.status && r.goal.status !== r.computedStatus && r.computedStatus !== 'Not Started'

  return (
    <article className="flex flex-col rounded-xl border border-hairline bg-surface transition-colors hover:border-surface-3">
      <header className="border-b border-hairline px-4 py-3.5">
        <div className="mb-2 flex items-start gap-2">
          <button
            onClick={() => onOpenItem({ kind: 'goal', id: r.goal.id })}
            className="min-w-0 flex-1 text-left"
          >
            <h3 className="truncate text-[15px] font-semibold text-ink hover:text-brand">
              {r.goal.title}
            </h3>
            <span className="tnum text-[11px] text-muted">{r.goal.id}</span>
          </button>
          <GoalStatusChip status={r.goal.status} />
        </div>

        <div className="flex items-center gap-3">
          <ProgressBar
            value={r.progress}
            height={6}
            color={
              r.overdue
                ? STATUS_COLOR.Blocked
                : pct >= 100
                  ? STATUS_COLOR.Complete
                  : STATUS_COLOR['In Progress']
            }
          />
          <span className="tnum w-10 shrink-0 text-right text-[13px] font-semibold text-ink">{pct}%</span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {r.goal.sheetId && r.goal.sheetId !== r.goal.id && <Tag>sheet {r.goal.sheetId}</Tag>}
          {r.overdue > 0 && <Tag tone="danger">{r.overdue} overdue</Tag>}
          {r.blocked > 0 && <Tag tone="warn">{r.blocked} blocked</Tag>}
          {!items.length && <Tag tone="warn">no work linked</Tag>}
        </div>

        {drift && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warn">
            <IconAlert className="size-3" />
            Marked “{r.goal.status}”, but the attached work reads “{r.computedStatus}”.
          </p>
        )}
      </header>

      <div className="flex-1 px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
          <span>
            {r.tasks.length} tasks · {r.milestones.length} milestones
          </span>
          {r.nextDue && <span>next {fmtDay(r.nextDue.due)}</span>}
        </div>
        {items.length ? (
          <>
            <StatusStack items={items} height={8} />
            <div className="mt-2.5">
              <StatusLegend items={items} />
            </div>
          </>
        ) : (
          <p className="py-2 text-[11px] text-muted">
            Nothing rolls up here yet — link tasks to this goal to give it a number.
          </p>
        )}

        {r.goal.successMetric ? (
          <p className="mt-3 border-t border-hairline pt-2.5 text-[12px] leading-relaxed text-ink-2">
            <span className="text-[11px] tracking-wide text-muted uppercase">Success metric </span>
            {r.goal.successMetric}
          </p>
        ) : (
          <p className="mt-3 border-t border-hairline pt-2.5 text-[11px] text-warn">
            No success metric — there is no agreed definition of done.
          </p>
        )}
      </div>

      {items.length > 0 && (
        <footer className="border-t border-hairline px-2 py-1.5">
          <ul className="max-h-40 space-y-px overflow-y-auto">
            {items.slice(0, 12).map((i) => (
              <li key={i.id}>
                <button
                  onClick={() =>
                    onOpenItem({ kind: 'goalIds' in i ? 'milestone' : 'task', id: i.id })
                  }
                  className={cx(
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-surface-2',
                  )}
                >
                  <span className="tnum w-14 shrink-0 text-[10px] font-semibold text-muted">{i.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">{i.title}</span>
                  <StatusChip status={i.status} size="xs" />
                </button>
              </li>
            ))}
          </ul>
          {items.length > 12 && (
            <p className="px-2 py-1 text-[11px] text-muted">+{items.length - 12} more</p>
          )}
        </footer>
      )}
    </article>
  )
}
