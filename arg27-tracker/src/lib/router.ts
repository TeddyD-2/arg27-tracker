import { useCallback, useEffect, useState } from 'react'

export type Route =
  | { view: 'dashboard' }
  | { view: 'goals'; id?: string }
  | { view: 'milestones'; id?: string }
  | { view: 'tasks'; id?: string }
  | { view: 'people'; id?: string }
  | { view: 'health' }

export const VIEWS = ['dashboard', 'goals', 'milestones', 'tasks', 'people', 'health'] as const

function parse(hash: string): Route {
  const [view, id] = hash.replace(/^#\/?/, '').split('/')
  const v = (VIEWS as readonly string[]).includes(view) ? view : 'dashboard'
  return { view: v, id: id ? decodeURIComponent(id) : undefined } as Route
}

/** Minimal hash router — no dependency, and the URL stays shareable. */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((r: Route) => {
    const id = 'id' in r && r.id ? `/${encodeURIComponent(r.id)}` : ''
    location.hash = `#/${r.view}${id}`
  }, [])

  return [route, navigate]
}

export function href(view: Route['view'], id?: string) {
  return `#/${view}${id ? `/${encodeURIComponent(id)}` : ''}`
}
