import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../lib/store'
import { CODE_BY_ASSEMBLY } from '../lib/types'
import { cx, StatusChip } from './ui'
import { IconGoal, IconMilestone, IconSearch, IconTask } from './icons'
import type { DrawerTarget } from './ItemDrawer'
import { VIEWS, type Route } from '../lib/router'

interface Hit {
  kind: 'task' | 'milestone' | 'goal' | 'view'
  id: string
  title: string
  sub: string
  status?: string
  score: number
}

/** Subsequence match with a bonus for prefix and word-start hits. */
function score(haystack: string, needle: string): number {
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  if (!n) return 1
  const idx = h.indexOf(n)
  if (idx === 0) return 100
  if (idx > 0) return h[idx - 1] === ' ' ? 80 : 60
  let i = 0
  for (const ch of h) {
    if (ch === n[i]) i++
    if (i === n.length) return 25
  }
  return 0
}

export function CommandPalette({
  open,
  onClose,
  onOpenItem,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onOpenItem: (t: DrawerTarget) => void
  onNavigate: (r: Route) => void
}) {
  const { ds } = useStore()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const out: Hit[] = []
    for (const v of VIEWS) {
      const s = score(v, q)
      if (s > 0) out.push({ kind: 'view', id: v, title: v[0].toUpperCase() + v.slice(1), sub: 'Go to view', score: s + 5 })
    }
    for (const t of ds.tasks) {
      const s = Math.max(score(t.title, q), score(t.id, q) * 1.1, ...t.owners.map((o) => score(o, q) * 0.9))
      if (s > 0)
        out.push({
          kind: 'task',
          id: t.id,
          title: t.title,
          sub: [CODE_BY_ASSEMBLY[t.assembly], t.owners.join(', ')].filter(Boolean).join(' · '),
          status: t.status,
          score: s,
        })
    }
    for (const m of ds.milestones) {
      const s = Math.max(score(m.title, q), score(m.id, q) * 1.1)
      if (s > 0)
        out.push({ kind: 'milestone', id: m.id, title: m.title, sub: m.due ? `Due ${m.due}` : 'No due date', status: m.status, score: s })
    }
    for (const g of ds.goals) {
      const s = Math.max(score(g.title, q), score(g.id, q) * 1.1)
      if (s > 0) out.push({ kind: 'goal', id: g.id, title: g.title, sub: 'Goal', score: s + 8 })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 40)
  }, [ds, q])

  useEffect(() => setCursor(0), [q])

  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const pick = (h: Hit) => {
    if (h.kind === 'view') onNavigate({ view: h.id } as Route)
    else onOpenItem({ kind: h.kind, id: h.id })
    onClose()
  }

  const Icon = { task: IconTask, milestone: IconMilestone, goal: IconGoal, view: IconSearch }

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="pop-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl shadow-black/70">
        <div className="flex items-center gap-2.5 border-b border-hairline px-4">
          <IconSearch className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks, milestones, goals, people…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, hits.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (e.key === 'Enter' && hits[cursor]) {
                e.preventDefault()
                pick(hits[cursor])
              } else if (e.key === 'Escape') {
                onClose()
              }
            }}
          />
          <kbd className="rounded border border-hairline px-1.5 py-0.5 text-[10px] text-muted">esc</kbd>
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {hits.map((h, i) => {
            const I = Icon[h.kind]
            return (
              <li key={`${h.kind}:${h.id}`}>
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(h)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left',
                    i === cursor ? 'bg-surface-3' : 'hover:bg-surface-2',
                  )}
                >
                  <I className={cx('size-4 shrink-0', i === cursor ? 'text-brand' : 'text-muted')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{h.title}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {h.kind !== 'view' && <span className="tnum mr-1.5 font-semibold">{h.id}</span>}
                      {h.sub}
                    </span>
                  </span>
                  {h.status !== undefined && <StatusChip status={h.status as never} size="xs" />}
                </button>
              </li>
            )
          })}
          {!hits.length && <li className="px-3 py-8 text-center text-sm text-muted">No matches</li>}
        </ul>

        <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 text-[11px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
