import type { Assembly, Milestone, Task } from './types'

/**
 * Assemblies the team has since combined into one role.
 *
 * The workbook still lists them apart — the sheet is edited by hand all season
 * and renaming a `Part Design` block there would orphan every ID under it — so
 * the fold happens on the way in, and a fresh import of an untouched sheet
 * still lands on the combined assembly.
 *
 * `scripts/build-seed.py` carries the same list; the two must stay in step or
 * a re-import would silently change the data.
 */
export interface AssemblyMerge {
  subteam: string
  /** Assembly codes folded away, e.g. `A05`. */
  from: string[]
  /** The one that survives. Its code keeps the IDs readable. */
  into: { code: string; name: string }
}

export const ASSEMBLY_MERGES: AssemblyMerge[] = [
  {
    subteam: 'Autonomy',
    from: ['A05'],
    into: { code: 'A04', name: 'Sensors, Harnessing, and Compute' },
  },
]

interface Mergeable {
  subteams: { code: string; name: string }[]
  assemblies: Assembly[]
  tasks: Task[]
  milestones: Milestone[]
}

/**
 * Fold the merged assemblies together, in place.
 *
 * Tasks moving across keep their place in sheet order and are renumbered into
 * the surviving assembly's sequence — `AU_A05_T003` becomes `AU_A04_T005` —
 * because the ID carries the assembly code everywhere the app shows it. The
 * workbook's own ID stays on the task as `sheetId`, and references to it from
 * other tasks and milestones follow the renumber.
 *
 * Run this before IDs are deduplicated, so a renumber that lands on an ID the
 * sheet already used is caught by that pass like any other collision.
 */
export function applyAssemblyMerges(data: Mergeable, merges = ASSEMBLY_MERGES): void {
  for (const merge of merges) {
    const subteam = data.subteams.find((s) => s.name === merge.subteam)
    if (!subteam) continue
    const codes = new Set([merge.into.code, ...merge.from])
    const mine = (a: { subteam: string }) => a.subteam === merge.subteam

    // One assembly where there were several, in the position of the first.
    // Spliced rather than reassigned: the caller holds this array.
    let kept = false
    const keep = data.assemblies.filter((a) => {
      if (!mine(a) || !codes.has(a.code)) return true
      if (kept) return false
      kept = true
      a.code = merge.into.code
      a.name = merge.into.name
      return true
    })
    data.assemblies.splice(0, data.assemblies.length, ...keep)

    const moved = data.tasks.filter((t) => mine(t) && codes.has(t.assemblyCode))
    const renamed = new Map<string, string>()
    moved.forEach((t, i) => {
      t.assembly = merge.into.name
      t.assemblyCode = merge.into.code
      const id = `${subteam.code}_${merge.into.code}_T${String(i + 1).padStart(3, '0')}`
      if (id !== t.id) {
        if (t.id) {
          renamed.set(t.id, id)
          t.sheetId = t.sheetId ?? t.id
        }
        t.id = id
      }
    })

    if (!renamed.size) continue
    const follow = (ids: string[]) => ids.map((id) => renamed.get(id) ?? id)
    for (const t of data.tasks) t.dependsOn = follow(t.dependsOn)
    for (const m of data.milestones) m.dependsOn = follow(m.dependsOn)
  }
}
