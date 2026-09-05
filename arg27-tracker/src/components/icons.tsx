/** Single-stroke 16px icons, drawn on a 16×16 grid so they align with 13px text. */
type P = { className?: string }

const base = 'size-4 shrink-0'
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Svg = ({ children, className }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 16 16" aria-hidden className={className ?? base}>
    {children}
  </svg>
)

export const IconDashboard = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="2" width="5" height="6" rx="1.2" {...stroke} />
    <rect x="9" y="2" width="5" height="4" rx="1.2" {...stroke} />
    <rect x="2" y="10" width="5" height="4" rx="1.2" {...stroke} />
    <rect x="9" y="8" width="5" height="6" rx="1.2" {...stroke} />
  </Svg>
)

export const IconGoal = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" {...stroke} />
    <circle cx="8" cy="8" r="3" {...stroke} />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" />
  </Svg>
)

export const IconMilestone = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.8l6.2 6.2L8 14.2 1.8 8z" {...stroke} />
  </Svg>
)

export const IconTask = (p: P) => (
  <Svg {...p}>
    <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.4" {...stroke} />
    <path d="M5.2 8.2l2 2 3.6-4" {...stroke} />
  </Svg>
)

export const IconPeople = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="5.5" r="2.6" {...stroke} />
    <path d="M1.6 13.6c.5-2.4 2.3-3.7 4.4-3.7s3.9 1.3 4.4 3.7" {...stroke} />
    <path d="M11 3.3a2.6 2.6 0 010 4.8M12.2 10.4c1.2.6 2 1.8 2.2 3.2" {...stroke} />
  </Svg>
)

export const IconHealth = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.8l5.4 2.2v4.1c0 3.2-2.2 5.4-5.4 6.1-3.2-.7-5.4-2.9-5.4-6.1V4z" {...stroke} />
    <path d="M5.6 8.2l1.7 1.7 3.1-3.4" {...stroke} />
  </Svg>
)

export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.2l6 10.4H2z" {...stroke} />
    <path d="M8 6.4v3" {...stroke} />
    <circle cx="8" cy="11.1" r="0.75" fill="currentColor" />
  </Svg>
)

export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" {...stroke} />
    <path d="M8 4.6V8l2.4 1.6" {...stroke} />
  </Svg>
)

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M8 3.2v9.6M3.2 8h9.6" {...stroke} />
  </Svg>
)

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" {...stroke} />
  </Svg>
)

export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5L10.5 8 6 12.5" {...stroke} />
  </Svg>
)

export const IconLink = (p: P) => (
  <Svg {...p}>
    <path d="M6.6 9.4a2.6 2.6 0 003.7 0l2-2a2.6 2.6 0 10-3.7-3.7l-.9.9" {...stroke} />
    <path d="M9.4 6.6a2.6 2.6 0 00-3.7 0l-2 2a2.6 2.6 0 103.7 3.7l.9-.9" {...stroke} />
  </Svg>
)

export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M3 7.5h7.2a3.3 3.3 0 110 6.6H6.5" {...stroke} />
    <path d="M5.6 4.6L2.8 7.5l2.8 2.9" {...stroke} />
  </Svg>
)

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.4v7.4M5.2 7.2L8 10l2.8-2.8" {...stroke} />
    <path d="M2.6 11.6v1.2c0 .5.4.8.9.8h9c.5 0 .9-.3.9-.8v-1.2" {...stroke} />
  </Svg>
)

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.5" {...stroke} />
    <path d="M10.5 10.5L14 14" {...stroke} />
  </Svg>
)

export const IconBlocked = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" {...stroke} />
    <path d="M3.9 12.1l8.2-8.2" {...stroke} />
  </Svg>
)

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M3 8.6l3.2 3.2L13 4.8" {...stroke} />
  </Svg>
)

export const IconFilter = (p: P) => (
  <Svg {...p}>
    <path d="M2.4 3.4h11.2L9.6 8.2v4.3l-3.2 1.6V8.2z" {...stroke} />
  </Svg>
)

export const IconGrid = (p: P) => (
  <Svg {...p}>
    <path d="M2 4.5h12M2 8h12M2 11.5h12" {...stroke} />
  </Svg>
)

export const IconBoard = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="3.4" height="11" rx="1" {...stroke} />
    <rect x="6.3" y="2.5" width="3.4" height="7.5" rx="1" {...stroke} />
    <rect x="10.6" y="2.5" width="3.4" height="9.5" rx="1" {...stroke} />
  </Svg>
)
