# ARG27 Program Tracker

A web app replacement for Cornell Racing's ARG27 season workbook,
`ARG27 - Goals, Milestones, Tasks, and Timeline.xlsx`. It keeps the model the
sheet already describes — **Goals → Milestones → Tasks**, organised by assembly
— but computes the rollups, the schedule and the gap-finding instead of asking
somebody to maintain them by hand.

Every subteam is imported: **13 subteams, 17 goals, 106 milestones, 221 tasks**.
A dropdown picks one subteam, or the full team at once.

```bash
cd arg27-tracker
npm install
npm run dev      # http://localhost:5173
```

Full documentation — what each view answers, how the import works, and the
judgement calls it makes about the sheet's half-filled rows — is in
[arg27-tracker/README.md](arg27-tracker/README.md).

## Layout

```
ARG27 - Goals, ... .xlsx   the source workbook, read by the importer
arg27-tracker/             the app
  scripts/build-seed.py    xlsx -> src/data/seed.json
  src/                     React + Vite + Tailwind, no backend
```

Edits made in the app live in the browser's `localStorage`; there is no server.
It is a single-user demonstration of the model, not a shared backend.
