# ARG27 Program Tracker

A web app replacement for `ARG27 - Goals, Milestones, Tasks, and Timeline.xlsx`.
Same model the sheet describes — **Goals → Milestones → Tasks**, organised by
assembly — but the rollups, schedule view and gap-finding are computed instead
of maintained by hand.

Every subteam is imported: **13 subteams, 17 goals, 106 milestones, 221 tasks**.
The dropdown under the logo picks one subteam — or **Full team**, the whole
programme at once — and the choice survives a reload. Everything downstream —
nav counts, timeline lanes, filters, rollups, data-health rules and exports —
follows the selection.

Grouping follows it too. Inside one subteam, work groups by **assembly** (the
sheet's `Part Design` blocks). Across the full team those codes would collide —
every subteam has an `A01` — so the timeline lanes, filters and rollup cards
switch to grouping by **subteam** instead. Creating new work is disabled in the
full-team view, since a new task has no subteam to belong to.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/, deployable anywhere
```

## What's in it

| View | What it answers |
|---|---|
| **Overview** | Everything at a glance: the schedule as a Gantt, one status card carrying completion and the status breakdowns, what needs attention, what's due in 45 days, which dependency chains are stalled. |
| **Goals** | Each of the subteam's season goals with progress rolled up from the milestones linked to it, plus a flag when the declared status disagrees with the data. |
| **Milestones** | Grouped by month or goal, with supporting-task progress on each card. |
| **Tasks** | Filterable table (inline status editing) or a drag-and-drop status board. Sorted by an attention score that blends lateness, priority, blockers and missing owners. |
| **Team load** | Who is carrying what, load balance across the subteam, and every open task with no owner. |
| **Data health** | Every concrete gap in the subteam's rows — missing owners, dates, statuses, success metrics, broken references — each one clickable straight into the editor. |

Extras: `Ctrl/Cmd+K` command palette over everything, undo, CSV/JSON export in
the sheet's own column names, and shareable URLs (`#/tasks/AU_A05_T005`).

## How the data works

**Export → Import .xlsx…** reads a new workbook in the browser and swaps the
data in place, so a refreshed sheet does not need a checkout or a Python run.
It parses first and reports what it found — subteams, goals, milestones, tasks —
before asking to replace, since the swap discards local edits.

`src/lib/importXlsx.ts` is a port of the script below and has to stay in step
with it: both must apply the same normalisation or a re-import would silently
change the data. They are verified against each other by importing the same
workbook and diffing every field against `seed.json`.

`scripts/build-seed.py` still generates the committed `src/data/seed.json`, and
is the right route when the app is being rebuilt anyway:

```bash
pip install openpyxl
python arg27-tracker/scripts/build-seed.py    # from the repo root
```

The app loads that seed, then keeps all edits in `localStorage` under
`arg27-tracker:v2` (the selected subteam under `arg27-tracker:subteam`). Export → *Reset to imported sheet* discards local
edits and returns to the workbook contents. There is no server; this is a
single-user demo of the model, not a shared backend.

### Decisions made during the import

The workbook is a template that has been filled in partway, so the importer
normalises rather than guesses:

- **Tasks come from the per-subteam pages**, not `Task Master`, which only
  aggregates them. Two subteams (Chassis, Powertrain) have goals and milestones
  but no task page at all; Unsprung has nothing and is left out of the switcher.
- **Assembly is the grouping dimension.** The sheet's `Part Design` column
  (`A06 - Perception and Data Interface`, …) is the only structure inside a
  subteam. All 83 assembly names across the workbook are distinct, so they can
  be mapped to their codes unambiguously. The list comes from each task page in
  sheet order, including blocks nobody has filled in yet.
- **Repeated header rows dropped.** Each task page restates its header above
  every assembly block, and the blocks are pre-seeded with blank placeholder
  rows. Only rows carrying a task title are imported.
- **Half-typed dates import blank.** One Due cell on the Milestones sheet holds
  the fragment `8/`. That is not a date, so it comes in empty and Data health
  reports the milestone as undated rather than the app guessing a year.
- **Goals re-keyed.** The Goals sheet numbers goals in the milestone namespace —
  `AU_M001` is both the goal "Complete Full Trackdrive" and the milestone
  "Autonomous Sensor + ARG26 Trackdrive". Goals become `AU_G001`… and keep their
  sheet ID as a breadcrumb, so the two can never collide in a link or a URL.
  Every ID carries its subteam's prefix, which is what keeps them unique across
  the whole workbook and lets edits be written back to one shared dataset.
- **Goal → milestone links are made in the app.** No sheet column connects them,
  so every goal imports unlinked and Data health reports it. Progress rolls up
  goal → milestone → task once a link exists.
- **Status vocabulary folded** onto one set: `Not Started, Planned, In Progress,
  In Review, Blocked, Complete`. (`Done` → Complete, `Review` → In Review, and
  the Goals sheet's `On track / Delayed` map to their own goal-status set.)
- **Duplicate IDs kept, not merged.** A reused auto-generated ID gets a `-2`
  suffix and a pointer back to the original.

**Nothing is auto-filled.** Blank stays blank so the Data health view can report
it and somebody can own closing it.

## Layout

```
scripts/build-seed.py    xlsx → seed.json
src/data/seed.json       imported data
src/lib/types.ts         domain model, status vocabulary, palette bindings
src/lib/derive.ts        rollups, attention score, data-health rules
src/lib/store.tsx        state, subteam scoping, persistence, undo, change log
src/lib/dates.ts         timezone-safe calendar-day helpers
src/components/          shared UI, charts, drawer, command palette
src/views/               one file per view
```

The Gantt lives on the Overview rather than a page of its own: a milestone strip
on top, then one swimlane per assembly (per subteam in the full-team view), with
a today line and a competition marker, over five windows — 30 days, 90 days,
6 months, season, everything.

**Pinch to zoom** steps between those windows, keeping the date under the cursor
in place; a trackpad pinch arrives as ctrl+wheel, and touchscreens are handled
through touch events. A plain wheel is left alone on purpose — the full-team
view stacks a dozen lanes of packed bars, so the chart has to scroll vertically
like anything else. The lane area is capped so a busy view scrolls inside the
card rather than running it to 1600px tall.

### Colour

Progress states use a single-hue blue ordinal ramp validated against the
`#14171c` chart surface, with reserved status colours either side. Blocked (red)
and Complete (green) are never adjacent in a stack, and every segment carries a
label — hue never has to carry meaning on its own. Priority repeats itself as a
bar count for the same reason.
