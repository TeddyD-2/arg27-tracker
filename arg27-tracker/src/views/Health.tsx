import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { completenessScore, findIssues, type DataIssue, type IssueSeverity } from '../lib/derive'
import { CODE_BY_ASSEMBLY } from '../lib/types'
import {
  Card,
  cx,
  EmptyState,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  AssemblyChip,
  Tag,
} from '../components/ui'
import { StatTile } from '../components/charts'
import { IconCheck, IconChevron } from '../components/icons'
import type { DrawerTarget } from '../components/ItemDrawer'

const SEVERITY: Record<IssueSeverity, { label: string; color: string; blurb: string }> = {
  high: { label: 'High', color: '#d03b3b', blurb: 'blocks planning or accountability' },
  medium: { label: 'Medium', color: '#fab219', blurb: 'weakens rollups and reporting' },
  low: { label: 'Low', color: '#71767f', blurb: 'tidy-up' },
}

export function Health({ onOpenItem }: { onOpenItem: (t: DrawerTarget) => void }) {
  const { ds } = useStore()
  const [severity, setSeverity] = useState<IssueSeverity | ''>('')
  const [kind, setKind] = useState<DataIssue['kind'] | ''>('')
  const [rule, setRule] = useState('')
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<'rule' | 'item'>('rule')

  const issues = useMemo(() => findIssues(ds), [ds])
  const score = useMemo(() => completenessScore(ds), [ds])

  const rules = useMemo(() => [...new Set(issues.map((i) => i.rule))].sort(), [issues])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    return issues.filter(
      (i) =>
        (!severity || i.severity === severity) &&
        (!kind || i.kind === kind) &&
        (!rule || i.rule === rule) &&
        (!n || `${i.entityId} ${i.entityTitle} ${i.rule} ${i.detail}`.toLowerCase().includes(n)),
    )
  }, [issues, severity, kind, rule, q])

  const byRule = useMemo(() => {
    const m = new Map<string, DataIssue[]>()
    for (const i of filtered) {
      if (!m.has(i.rule)) m.set(i.rule, [])
      m.get(i.rule)!.push(i)
    }
    return [...m.entries()].sort(([, a], [, b]) => b.length - a.length)
  }, [filtered])

  const byItem = useMemo(() => {
    const m = new Map<string, DataIssue[]>()
    for (const i of filtered) {
      const key = `${i.kind}:${i.entityId}`
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(i)
    }
    return [...m.entries()].sort(([, a], [, b]) => b.length - a.length)
  }, [filtered])

  const counts = {
    high: issues.filter((i) => i.severity === 'high').length,
    medium: issues.filter((i) => i.severity === 'medium').length,
    low: issues.filter((i) => i.severity === 'low').length,
  }

  /** Only tasks carry an assembly; milestones and goals sit above that level. */
  const assemblyOf = (i: DataIssue) =>
    (i.kind === 'task' ? ds.tasks.find((t) => t.id === i.entityId)?.assembly : '') ?? ''

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="Team"
        title="Data health"
        description="The tracker is only as good as what is entered. Every item below is a concrete gap someone can close in under a minute."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Field completeness"
          value={score}
          unit="%"
          tone={score >= 80 ? 'good' : score >= 55 ? 'warn' : 'danger'}
          hint="of the fields the tracker relies on"
        />
        {(['high', 'medium', 'low'] as const).map((s) => (
          <StatTile
            key={s}
            label={`${SEVERITY[s].label} severity`}
            value={counts[s]}
            tone={s === 'high' ? (counts[s] ? 'danger' : 'good') : s === 'medium' ? 'warn' : 'neutral'}
            hint={SEVERITY[s].blurb}
            onClick={() => setSeverity(severity === s ? '' : s)}
          />
        ))}
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search issues…" className="min-w-56 flex-1" />
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IssueSeverity | '')}
            placeholder="Any severity"
            options={(['high', 'medium', 'low'] as const).map((s) => ({ value: s, label: SEVERITY[s].label }))}
          />
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as DataIssue['kind'] | '')}
            placeholder="Any type"
            options={[
              { value: 'task', label: 'Tasks' },
              { value: 'milestone', label: 'Milestones' },
              { value: 'goal', label: 'Goals' },
            ]}
          />
          <Select
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            placeholder="Any rule"
            options={rules.map((r) => ({ value: r, label: r }))}
          />
          <Segmented
            value={group}
            onChange={setGroup}
            options={[
              { value: 'rule', label: 'Group by rule' },
              { value: 'item', label: 'Group by item' },
            ]}
          />
          <span className="tnum ml-auto text-xs text-muted">
            <span className="font-semibold text-ink">{filtered.length}</span> issues
          </span>
        </div>
      </Card>

      {!filtered.length ? (
        <Card>
          <EmptyState
            icon={<IconCheck className="size-7" />}
            title="Nothing to fix here"
            hint="Either the data is clean or the filters are too narrow."
          />
        </Card>
      ) : group === 'rule' ? (
        <div className="space-y-3">
          {byRule.map(([ruleName, list]) => (
            <Card key={ruleName} pad={false}>
              <header className="flex items-center gap-3 border-b border-hairline px-4 py-2.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: SEVERITY[list[0].severity].color }}
                />
                <h2 className="text-[13px] font-semibold text-ink">{ruleName}</h2>
                <span className="text-[11px] text-muted">{SEVERITY[list[0].severity].blurb}</span>
                <span className="tnum ml-auto rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">
                  {list.length}
                </span>
              </header>
              <ul className="max-h-80 divide-y divide-hairline overflow-y-auto">
                {list.map((i) => (
                  <li key={i.id}>
                    <button
                      onClick={() => onOpenItem({ kind: i.kind, id: i.entityId })}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="tnum w-16 shrink-0 text-[11px] font-semibold text-muted">
                        {i.entityId}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                        {i.entityTitle}
                      </span>
                      {assemblyOf(i) && (
                        <AssemblyChip name={assemblyOf(i)} code={CODE_BY_ASSEMBLY[assemblyOf(i)] ?? '??'} />
                      )}
                      <span className="hidden max-w-xs truncate text-[11px] text-muted lg:block">
                        {i.detail}
                      </span>
                      <IconChevron className="size-3 shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card pad={false}>
          <ul className="divide-y divide-hairline">
            {byItem.map(([key, list]) => {
              const first = list[0]
              return (
                <li key={key} className="px-4 py-3">
                  <button
                    onClick={() => onOpenItem({ kind: first.kind, id: first.entityId })}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="tnum w-16 shrink-0 text-[11px] font-semibold text-muted">
                      {first.entityId}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {first.entityTitle}
                    </span>
                    <span className="text-[11px] text-muted capitalize">{first.kind}</span>
                    <span className="tnum rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">
                      {list.length}
                    </span>
                  </button>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[76px]">
                    {list.map((i) => (
                      <span
                        key={i.id}
                        title={i.detail}
                        className={cx(
                          'rounded-md border px-1.5 py-0.5 text-[11px]',
                          i.severity === 'high'
                            ? 'border-st-blocked/40 bg-st-blocked/10 text-st-blocked'
                            : i.severity === 'medium'
                              ? 'border-warn/40 bg-warn/10 text-warn'
                              : 'border-hairline bg-surface-2 text-muted',
                        )}
                      >
                        {i.rule}
                      </span>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-4" title="What is checked">
        <ul className="grid gap-2 text-[13px] text-ink-2 sm:grid-cols-2">
          {[
            'Tasks have a status, due date, owner, priority, an assembly, and a milestone to roll into.',
            'Milestones have a due date, a status, at least one goal, and supporting tasks.',
            'Goals have a success metric and a status that agrees with the work beneath them.',
            'Start dates come before due dates, and tasks are not due after the milestone they support.',
            'Dependency and milestone references point at rows that actually exist.',
            'Auto-generated IDs are unique — the source sheet reuses a few.',
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <IconCheck className="mt-0.5 size-3.5 shrink-0 text-st-done" />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-hairline pt-3 text-[11px] text-muted">
          Nothing is auto-filled. Blank cells stay blank so the gap is visible and someone owns
          closing it. <Tag>{ds.meta.source}</Tag>
        </p>
      </Card>
    </div>
  )
}
