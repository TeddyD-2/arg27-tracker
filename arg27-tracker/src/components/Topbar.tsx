import { Button } from './ui'
import { SearchButton } from './Actions'

/**
 * Narrow screens only. On desktop the sidebar carries the search box and the
 * global actions, so the content area starts at the top of the window.
 */
export function Topbar({
  onOpenPalette,
  onToggleNav,
}: {
  onOpenPalette: () => void
  onToggleNav: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-plane/85 px-5 backdrop-blur-md lg:hidden">
      <Button onClick={onToggleNav} aria-label="Open navigation">
        <svg viewBox="0 0 16 16" aria-hidden className="size-4">
          <path
            d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </Button>
      <SearchButton onOpenPalette={onOpenPalette} className="md:max-w-md" />
    </header>
  )
}
