import { useCallback, useState } from 'react'

/**
 * A hand-picked lane order for the Timeline, per scope.
 *
 * Lanes otherwise sort by how much work they carry, which is the right default
 * and the wrong one the moment the chart is for an audience: a review runs in
 * the order the team presents in, and a slide reads top to bottom. The order is
 * a view preference, not data — it lives in this browser and never touches the
 * dataset, so it survives an import and is not worth an undo entry.
 *
 * The scope is the selected subteam, or the all-teams sentinel; the lanes mean
 * different things in each (assemblies within a subteam, subteams across the
 * program), so each keeps its own order.
 */

const KEY = 'arg27-tracker:laneOrder'

type Orders = Record<string, string[]>

function read(): Orders {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    // Anything but a map of string lists is treated as absent rather than
    // trusted — a half-written value should not break the chart.
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Orders).filter(
        ([, v]) => Array.isArray(v) && v.every((n) => typeof n === 'string'),
      ),
    )
  } catch {
    return {}
  }
}

export interface LaneOrder {
  /** Lane names, most-wanted first. Empty when the scope has no custom order. */
  order: string[]
  custom: boolean
  /** Move `name` one place towards the top (-1) or the bottom (1). */
  move: (lanes: string[], name: string, dir: -1 | 1) => void
  /** Back to largest-first. */
  reset: () => void
}

export function useLaneOrder(scope: string): LaneOrder {
  const [orders, setOrders] = useState<Orders>(read)

  const write = useCallback((next: Orders) => {
    setOrders(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* private mode — the order just will not survive a reload */
    }
  }, [])

  const move = useCallback(
    (lanes: string[], name: string, dir: -1 | 1) => {
      // Seeded from the lanes as they are on screen, so the first nudge of an
      // unordered chart keeps every other lane exactly where the eye left it.
      const next = lanes.slice()
      const i = next.indexOf(name)
      const j = i + dir
      if (i === -1 || j < 0 || j >= next.length) return
      ;[next[i], next[j]] = [next[j], next[i]]
      write({ ...orders, [scope]: next })
    },
    [orders, scope, write],
  )

  const reset = useCallback(() => {
    const next = { ...orders }
    delete next[scope]
    write(next)
  }, [orders, scope, write])

  return { order: orders[scope] ?? [], custom: (orders[scope]?.length ?? 0) > 0, move, reset }
}
