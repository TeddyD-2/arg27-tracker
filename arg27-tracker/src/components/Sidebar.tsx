import logo from '../assets/cornell-racing.webp'
import { href, type Route } from '../lib/router'
import { ALL_TEAMS, useStore } from '../lib/store'
import { findIssues, healthOf, isDone } from '../lib/derive'
import { cx, Select } from './ui'
import { Actions, SearchButton } from './Actions'
import {
  IconAlert,
  IconDashboard,
  IconGoal,
  IconHealth,
  IconMilestone,
  IconPeople,
  IconTask,
} from './icons'
import { useMemo } from 'react'
import type { DrawerTarget } from './ItemDrawer'

const NAV: {
  view: Route['view']
  label: string
  Icon: (p: { className?: string }) => React.ReactElement
}[] = [
  { view: 'dashboard', label: 'Overview', Icon: IconDashboard },
  { view: 'goals', label: 'Goals', Icon: IconGoal },
  { view: 'milestones', label: 'Milestones', Icon: IconMilestone },
  { view: 'tasks', label: 'Tasks', Icon: IconTask },
  { view: 'people', label: 'Team load', Icon: IconPeople },
  { view: 'health', label: 'Data health', Icon: IconHealth },
]

export function Sidebar({
  route,
  onNavigate,
  onOpenPalette,
  onOpenItem,
  onDismiss,
}: {
  route: Route
  onNavigate: (r: Route) => void
  onOpenPalette: () => void
  onOpenItem: (t: DrawerTarget) => void
  /** Present only when the sidebar is showing as an overlay on a narrow screen. */
  onDismiss?: () => void
}) {
  const { ds, subteam, subteams, setSubteam } = useStore()

  const counts = useMemo(() => {
    const overdue = ds.tasks.filter((t) => !isDone(t) && healthOf(t).band === 'overdue').length
    return {
      goals: ds.goals.length,
      milestones: ds.milestones.length,
      tasks: ds.tasks.length,
      people: new Set(ds.tasks.flatMap((t) => t.owners)).size,
      health: findIssues(ds).filter((i) => i.severity === 'high').length,
      overdue,
    }
  }, [ds])

  return (
    <aside className="weave flex w-[236px] shrink-0 flex-col border-r border-hairline bg-surface/60">
      <div className="border-b border-hairline px-4 py-4">
        <a href={href('dashboard')} aria-label="ARG27 Tracker — overview" className="block px-1">
          <img src={logo} alt="Cornell Racing" className="h-7 w-auto" />
        </a>
        {/* One subteam is on screen at a time; this is what switches it. */}
        <div className="mt-3">
          <label htmlFor="subteam" className="sr-only">
            Subteam
          </label>
          <Select
            id="subteam"
            value={subteam}
            onChange={(e) => setSubteam(e.target.value)}
            options={[
              { value: ALL_TEAMS, label: 'Full team' },
              ...subteams.map((s) => ({ value: s.name, label: `${s.code} · ${s.name}` })),
            ]}
            className="w-full"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ view, label, Icon }) => {
            const active = route.view === view
            const badge =
              view === 'health'
                ? counts.health
                : view === 'goals'
                  ? counts.goals
                  : view === 'milestones'
                    ? counts.milestones
                    : view === 'tasks'
                      ? counts.tasks
                      : view === 'people'
                        ? counts.people
                        : 0
            return (
              <li key={view}>
                <button
                  onClick={() => {
                    onNavigate({ view } as Route)
                    onDismiss?.()
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'bg-surface-3 font-medium text-ink'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {active && (
                    <span className="absolute top-1/2 -left-3 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                  )}
                  <Icon
                    className={cx(
                      'size-4 shrink-0',
                      active ? 'text-brand' : 'text-muted group-hover:text-ink-2',
                    )}
                  />
                  <span className="flex-1 text-left">{label}</span>
                  {badge > 0 && (
                    <span
                      className={cx(
                        'tnum rounded px-1.5 py-px text-[10px] font-medium',
                        view === 'health'
                          ? 'bg-st-blocked/15 text-st-blocked'
                          : 'bg-surface-3 text-muted',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {counts.overdue > 0 && (
        <button
          onClick={() => {
            onNavigate({ view: 'tasks' })
            onDismiss?.()
          }}
          className="m-3 flex items-center gap-2.5 rounded-lg border border-st-blocked/30 bg-st-blocked/8 px-3 py-2.5 text-left transition-colors hover:bg-st-blocked/14"
        >
          <IconAlert className="size-4 shrink-0 text-st-blocked" />
          <div>
            <div className="tnum text-[13px] font-semibold text-st-blocked">{counts.overdue} overdue</div>
            <div className="text-[11px] text-muted">tasks past their due date</div>
          </div>
        </button>
      )}

      {/* Search and the global actions sit here rather than in a top bar, so the
          content area gets the full height of the window. */}
      <div className="space-y-2 border-t border-hairline p-3">
        <SearchButton
          onOpenPalette={() => {
            onOpenPalette()
            onDismiss?.()
          }}
        />
        <Actions onOpenItem={onOpenItem} />
      </div>

      <div className="border-t border-hairline px-5 py-3 text-[11px] text-muted">
        Imported from<br />
        <span className="text-ink-2">{ds.meta.source}</span>
      </div>
    </aside>
  )
}
