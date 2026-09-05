import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import {
  GOAL_STATUS_COLOR,
  PRIORITY_COLOR,
  STATUS_COLOR,
  type GoalStatus,
  type Priority,
  type Status,
} from '../lib/types'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* -------------------------------------------------------------- containers */

export function Card({
  children,
  className,
  bodyClassName,
  title,
  subtitle,
  action,
  pad = true,
}: {
  children?: ReactNode
  className?: string
  /** For cards that have to fill a row rather than size to their content. */
  bodyClassName?: string
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  pad?: boolean
}) {
  return (
    <section
      className={cx(
        'rounded-xl border border-hairline bg-surface shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold tracking-wide text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cx(pad && 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ badges */

export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cx('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  )
}

/**
 * Status is always colour + text. The palette pairs Blocked (red) with
 * Complete (green), so the label is what actually carries the meaning.
 */
export function StatusChip({ status, size = 'sm' }: { status: Status | ''; size?: 'sm' | 'xs' }) {
  const s = (status || 'Not Started') as Status
  const color = STATUS_COLOR[s]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        !status && 'italic',
      )}
      style={{
        borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color: `color-mix(in oklab, ${color} 72%, #ffffff)`,
      }}
      title={status ? s : 'No status set in the source sheet'}
    >
      <Dot color={color} />
      {status ? s : 'Unset'}
    </span>
  )
}

export function PriorityChip({ priority }: { priority: Priority | '' }) {
  if (!priority) return <span className="text-xs text-muted">—</span>
  const color = PRIORITY_COLOR[priority]
  const bars = { Critical: 4, High: 3, Medium: 2, Low: 1 }[priority]
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap" style={{ color }}>
      {/* bar count repeats the priority so it survives colour-blind viewing */}
      <span aria-hidden className="flex items-end gap-[2px]">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className="w-[3px] rounded-[1px]"
            style={{ height: 3 + n * 2, background: n <= bars ? color : '#2b323c' }}
          />
        ))}
      </span>
      {priority}
    </span>
  )
}

export function GoalStatusChip({ status }: { status: GoalStatus | '' }) {
  if (!status) return <span className="text-xs text-muted italic">Unset</span>
  const color = GOAL_STATUS_COLOR[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color: `color-mix(in oklab, ${color} 72%, #ffffff)`,
      }}
    >
      <Dot color={color} />
      {status}
    </span>
  )
}

export function AssemblyChip({ name, code }: { name: string; code: string }) {
  if (!name) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2"
      title={name}
    >
      <span className="font-semibold tracking-wider text-muted">{code}</span>
      <span className="hidden truncate sm:inline">{name}</span>
    </span>
  )
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'warn' | 'danger' }) {
  const tones = {
    neutral: 'border-hairline bg-surface-2 text-ink-2',
    brand: 'border-brand/40 bg-brand/12 text-brand',
    warn: 'border-warn/40 bg-warn/12 text-warn',
    danger: 'border-st-blocked/40 bg-st-blocked/12 text-st-blocked',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium', tones[tone])}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ inputs */

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger'
  size?: 'sm' | 'md'
}) {
  const variants = {
    primary: 'bg-brand-deep text-white hover:bg-brand border-brand-deep hover:border-brand',
    ghost: 'border-hairline bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
    subtle: 'border-transparent text-muted hover:bg-surface-2 hover:text-ink',
    danger: 'border-st-blocked/40 bg-st-blocked/10 text-st-blocked hover:bg-st-blocked/20',
  }
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-[13px]',
        variants[variant],
        className,
      )}
    />
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

const controlCls =
  'w-full rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink placeholder:text-muted transition-colors hover:border-surface-3 focus:border-brand focus:outline-none'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(controlCls, props.className)} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(controlCls, 'resize-y', props.className)} />
}

export function Select({
  options,
  placeholder,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <div className="relative">
      <select {...rest} className={cx(controlCls, 'appearance-none pr-7', rest.className)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cx('relative', className)}>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted"
      >
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(controlCls, 'pl-8')}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="size-3">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** Segmented control — for small, mutually exclusive view switches. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
}) {
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Click-to-edit text. Used for inline title edits so the grid stays usable
 * without opening a drawer for every small correction.
 */
export function InlineEdit({
  value,
  onCommit,
  className,
  placeholder = 'Empty',
  multiline,
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const done = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft.trim())
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cx(
          'w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-2',
          !value && 'text-muted italic',
          className,
        )}
        title="Click to edit"
      >
        {value || placeholder}
      </button>
    )
  }

  const shared = {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: done,
    className: cx(controlCls, 'px-1 py-0.5', className),
  }

  return multiline ? (
    <textarea
      {...shared}
      ref={ref as React.Ref<HTMLTextAreaElement>}
      rows={3}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  ) : (
    <input
      {...shared}
      ref={ref as React.Ref<HTMLInputElement>}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  )
}

/* ------------------------------------------------------------------ meters */

export function ProgressBar({
  value,
  className,
  color = 'var(--color-st-progress)',
  height = 6,
}: {
  value: number
  className?: string
  color?: string
  height?: number
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className={cx('w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  labelledBy?: string
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cx(
          'pop-in relative z-10 w-full rounded-2xl border border-hairline bg-surface shadow-2xl shadow-black/60',
          width,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Small hover tooltip used by the custom SVG charts. */
export function ChartTooltip({
  x,
  y,
  children,
}: {
  x: number
  y: number
  children: ReactNode
}) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-hairline bg-surface-2 px-2.5 py-2 text-xs shadow-xl shadow-black/50"
      style={{ left: x, top: y }}
    >
      {children}
    </div>,
    document.body,
  )
}
