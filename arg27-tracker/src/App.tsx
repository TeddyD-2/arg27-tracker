import { useEffect, useState } from 'react'
import { StoreProvider } from './lib/store'
import { useRoute } from './lib/router'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { CommandPalette } from './components/CommandPalette'
import { ItemDrawer, type DrawerTarget } from './components/ItemDrawer'
import { Dashboard } from './views/Dashboard'
import { Goals } from './views/Goals'
import { Milestones } from './views/Milestones'
import { Tasks } from './views/Tasks'
import { People } from './views/People'
import { Health } from './views/Health'

function Shell() {
  const [route, navigate] = useRoute()
  const [drawer, setDrawer] = useState<DrawerTarget>(null)
  const [palette, setPalette] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
      // "/" opens search, but not while typing into a field.
      const el = document.activeElement
      const typing = el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      if (e.key === '/' && !typing) {
        e.preventDefault()
        setPalette(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Route changes close the drawer so the URL and the UI never disagree.
  useEffect(() => {
    setDrawer(null)
  }, [route.view])

  const focusId = 'id' in route ? route.id : undefined

  return (
    <div className="flex h-full">
      {/* Permanent rail on desktop; slide-over below `lg`. */}
      <div className="hidden lg:flex">
        <Sidebar
          route={route}
          onNavigate={navigate}
          onOpenPalette={() => setPalette(true)}
          onOpenItem={setDrawer}
        />
      </div>
      {navOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNavOpen(false)} />
          <div className="relative">
            <Sidebar
              route={route}
              onNavigate={navigate}
              onOpenPalette={() => setPalette(true)}
              onOpenItem={setDrawer}
              onDismiss={() => setNavOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenPalette={() => setPalette(true)} onToggleNav={() => setNavOpen((o) => !o)} />

        <main className="flex-1 overflow-y-auto px-5 py-6 lg:px-8">
          <div className="mx-auto max-w-[1600px]">
            {route.view === 'dashboard' && <Dashboard onOpenItem={setDrawer} onNavigate={navigate} />}
            {route.view === 'goals' && <Goals onOpenItem={setDrawer} focusId={focusId} />}
            {route.view === 'milestones' && <Milestones onOpenItem={setDrawer} focusId={focusId} />}
            {route.view === 'tasks' && <Tasks onOpenItem={setDrawer} focusId={focusId} />}
            {route.view === 'people' && <People onOpenItem={setDrawer} focusId={focusId} />}
            {route.view === 'health' && <Health onOpenItem={setDrawer} />}
          </div>
        </main>
      </div>

      <ItemDrawer target={drawer} onClose={() => setDrawer(null)} />
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        onOpenItem={setDrawer}
        onNavigate={navigate}
      />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
