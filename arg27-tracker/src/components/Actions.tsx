import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { exportJson, exportMilestonesCsv, exportTasksCsv } from '../lib/export'
import type { ImportResult } from '../lib/importXlsx'
import { Button, cx, Modal } from './ui'
import { IconDownload, IconPlus, IconSearch, IconUndo } from './icons'
import type { DrawerTarget } from './ItemDrawer'

/**
 * The app's global controls. They live at the foot of the sidebar so the
 * content area starts at the top of the window; the narrow-screen bar reuses
 * the same pieces.
 */

function Menu({
  label,
  children,
  /** Menus at the foot of the sidebar have to open upwards. */
  placement = 'down',
  className,
  disabled,
  title,
}: {
  label: React.ReactNode
  children: React.ReactNode
  placement?: 'up' | 'down'
  className?: string
  disabled?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className={cx('relative', className)}>
      <Button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={title}
        className="w-full"
      >
        {label}
      </Button>
      {open && !disabled && (
        <div
          onClick={() => setOpen(false)}
          className={cx(
            'pop-in absolute left-0 z-40 w-56 overflow-hidden rounded-xl border border-hairline bg-surface-2 p-1 shadow-2xl shadow-black/60',
            placement === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode
  onClick: () => void
  tone?: 'danger'
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-3',
        tone === 'danger' ? 'text-st-blocked' : 'text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export function SearchButton({
  onOpenPalette,
  className,
}: {
  onOpenPalette: () => void
  className?: string
}) {
  return (
    <button
      onClick={onOpenPalette}
      className={cx(
        'group flex h-8 w-full items-center gap-2.5 rounded-lg border border-hairline bg-surface px-3 text-left text-[13px] text-muted transition-colors hover:border-surface-3 hover:text-ink-2',
        className,
      )}
    >
      <IconSearch className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">Search…</span>
      <kbd className="hidden rounded border border-hairline px-1.5 py-0.5 text-[10px] sm:block">
        {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K
      </kbd>
    </button>
  )
}

export function Actions({
  onOpenItem,
  placement = 'up',
}: {
  onOpenItem: (t: DrawerTarget) => void
  placement?: 'up' | 'down'
}) {
  const {
    ds,
    isAllTeams,
    undo,
    canUndo,
    resetToSource,
    replaceDataset,
    createTask,
    createMilestone,
    createGoal,
  } = useStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  /** The parsed workbook, held until the swap is confirmed. */
  const [pending, setPending] = useState<{ result: ImportResult; name: string } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    setImportError(null)
    try {
      // Loaded on demand: the xlsx parser is most of a megabyte, and almost
      // nobody imports in a given session.
      const { importWorkbook } = await import('../lib/importXlsx')
      const result = importWorkbook(await file.arrayBuffer(), file.name)
      setPending({ result, name: file.name })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'that file could not be read')
    }
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      <Button onClick={undo} disabled={!canUndo} title="Undo last change" className="w-full">
        <IconUndo className="size-3.5" />
        Undo
      </Button>

      <Menu
        placement={placement}
        label={
          <>
            <IconDownload className="size-3.5" />
            Export
          </>
        }
      >
        <MenuItem onClick={() => exportTasksCsv(ds)}>Tasks → CSV</MenuItem>
        <MenuItem onClick={() => exportMilestonesCsv(ds)}>Milestones → CSV</MenuItem>
        <MenuItem onClick={() => exportJson(ds)}>Everything → JSON</MenuItem>
        <div className="my-1 border-t border-hairline" />
        <MenuItem onClick={() => fileRef.current?.click()}>Import .xlsx…</MenuItem>
        <div className="my-1 border-t border-hairline" />
        <MenuItem tone="danger" onClick={() => setConfirmReset(true)}>
          Reset to imported sheet
        </MenuItem>
      </Menu>

      <Menu
        placement={placement}
        // A new item has to belong to a subteam, and the whole-program view is
        // not one. Pick a subteam first.
        disabled={isAllTeams}
        title={isAllTeams ? 'Pick a subteam to add to it' : undefined}
        label={
          <>
            <IconPlus className="size-3.5" />
            New
          </>
        }
      >
        <MenuItem onClick={() => onOpenItem({ kind: 'task', id: createTask({}).id })}>
          Task
        </MenuItem>
        <MenuItem onClick={() => onOpenItem({ kind: 'milestone', id: createMilestone({}).id })}>
          Milestone
        </MenuItem>
        <MenuItem onClick={() => onOpenItem({ kind: 'goal', id: createGoal({}).id })}>
          Goal
        </MenuItem>
      </Menu>

      {/* Kept out of the menu so the picker survives the menu closing. */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          void onPickFile(e.target.files?.[0])
          // Reset, so picking the same file twice still fires a change.
          e.target.value = ''
        }}
      />

      <Modal
        open={!!pending || !!importError}
        onClose={() => {
          setPending(null)
          setImportError(null)
        }}
        width="max-w-md"
      >
        <div className="p-5">
          {importError ? (
            <>
              <h2 className="text-base font-semibold text-ink">That workbook could not be read</h2>
              <p className="mt-2 text-sm text-ink-2">{importError}</p>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => setImportError(null)}>Close</Button>
              </div>
            </>
          ) : pending ? (
            <>
              <h2 className="text-base font-semibold text-ink">
                Replace the data with this workbook?
              </h2>
              <p className="mt-2 text-sm text-ink-2">
                <span className="text-ink">{pending.name}</span> reads as{' '}
                {pending.result.counts.subteams} subteams, {pending.result.counts.goals} goals,{' '}
                {pending.result.counts.milestones} milestones and {pending.result.counts.tasks}{' '}
                tasks.
              </p>
              <p className="mt-2 text-sm text-ink-2">
                Every edit made in this browser is discarded. Export first if you want to keep them.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setPending(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    replaceDataset(pending.result.data)
                    setPending(null)
                  }}
                >
                  Import
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} width="max-w-sm">
        <div className="p-5">
          <h2 className="text-base font-semibold text-ink">Reset to the imported sheet?</h2>
          <p className="mt-2 text-sm text-ink-2">
            Every edit made in this browser is discarded and the data returns to what was read out
            of <span className="text-ink">{ds.meta.source}</span>. This cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetToSource()
                setConfirmReset(false)
              }}
            >
              Reset everything
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
