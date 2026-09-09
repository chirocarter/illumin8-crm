# Illumin8 Outreach

A custom CRM / outreach command center for the Community Outreach Coordinator at
**Illumin8 Chiropractic** (Albuquerque: NE Heights, Westside, Downtown).

Built to replace the ClickUp system: track restaurant drop box partnerships,
lunch-and-learns, gym screening events, the outreach pipeline, leads, and
outreach-attributed appointments — with **fully deterministic reporting**.
No AI anywhere in the numbers: every metric is a readable SQL query, and every
number on screen links to the exact filtered records that produced it.

## Quick start

```bash
npm install
npm run db:migrate   # create the SQLite database (data/outreach.db)
npm run db:seed      # realistic Illumin8 sample data
npm run dev          # http://localhost:3000
```

**Login:** `carter@illumin8chiro.com` / `illumin8` (change it in Settings → Profile).

Other commands:

| Command | What it does |
|---|---|
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:reset` | Wipe the database, re-migrate, re-seed |
| `npm run db:generate` | Generate a new migration after editing `src/db/schema.ts` |

## Stack

- **Next.js 15** (App Router, server components, server actions) + TypeScript
- **Tailwind CSS v4** — custom Apple-inspired design system, no component library
- **SQLite + Drizzle ORM** — zero external services; swap to Postgres/Supabase later by
  changing the Drizzle driver (the schema and queries carry over)
- Simple email/password auth with a signed HMAC session cookie (`src/lib/auth.ts`, `src/middleware.ts`)

Set `SESSION_SECRET` in `.env.local` for production use.

## Where things live

| Path | Purpose |
|---|---|
| `src/db/schema.ts` | All 16 tables (accounts, contacts, opportunities, activities, tasks, partners, campaigns, events, leads, appointments, tags, goals…) |
| `src/db/seed.ts` | Sample data — dates are relative to "today" so the dashboard is always alive |
| `src/lib/taxonomy.ts` | **Single source of truth** for every status/stage/type list. Reports reference these exact strings |
| `src/lib/metrics.ts` | The metric engine: each metric = one SQL query + its drill-down URL. Dashboard, weekly reports, and goals all use it, so numbers always agree |
| `src/lib/focus.ts` | "Today's Focus" scoring — plain, documented rules (due dates, stage weight, deal value, high-value verticals, event proximity) |
| `src/lib/lists.ts` | URL-driven list queries shared by every list page **and** CSV export |
| `src/app/actions.ts` | All mutations (server actions) |
| `src/app/(app)/…` | Pages: dashboard, accounts, contacts, pipeline, calendar, activities, tasks, partners, campaigns, events, leads, appointments, reports (7), settings, search |
| `src/components/ActivityWizard.tsx` | Log Activity funnel — one question per screen (type → business → contact → outcome → follow-up → notes), mobile-first |
| `src/app/(app)/calendar` | Unified calendar: events, appointments, follow-up tasks, and drop box pickups (month grid on desktop, agenda on mobile) |
| `src/app/api/export` | CSV export — runs the same query builders as the page you're looking at |

## The rules the numbers follow

Documented here so reporting stays honest (also shown in the reports UI):

- **Businesses contacted** — distinct businesses with ≥1 outreach activity in range.
- **Partnership conversations** — activities with outcome *Reached Decision Maker,
  Interested, Booked Meeting, Booked Event,* or *Closed/Converted*.
- **Events booked** — events whose `bookedAt` timestamp (stamped the first time an event
  reaches Booked/Confirmed) falls in range.
- **Events held** — events with status *Completed* / *Follow-Up Needed* whose date is in range.
- **Appointments booked** — appointments created in range; **showed/no-show** use the
  scheduled date. Revenue is only what you enter manually.
- **Stale opportunity** — open stage, unchanged for 14+ days.
- Weeks run **Friday–Thursday**. The weekly report is pulled on Friday for the period
  that closed the night before, so a week is anchored on Friday rather than Monday.
  Defined once in `src/lib/dates.ts`; nothing else hard-codes a day.

## Deploying (use it on your phone, add teammates)

The app runs in two database modes with zero code changes:

- **Local (default):** SQLite file at `data/outreach.db`.
- **Hosted:** set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` and it talks to
  [Turso](https://turso.tech) (hosted SQLite) instead. This is the deploy path.

### Option A — Vercel + Turso (recommended)

1. Push this folder to a GitHub repo.
2. **Turso** (the database): sign up at turso.tech → create a database →
   copy its URL (`libsql://…`) and create an auth token.
3. Apply schema + starting data to it from this machine (PowerShell):
   ```powershell
   $env:TURSO_DATABASE_URL="libsql://…"; $env:TURSO_AUTH_TOKEN="…"
   # --prod is required: without it this migrates the LOCAL file, never Turso.
   npm run db:migrate -- --prod
   # Clean start for real use — admin login + Albuquerque/clinics + goals, no demo data.
   # Set ADMIN_PASSWORD first to choose the password, or read the temp one it prints.
   $env:ADMIN_PASSWORD="choose-a-strong-one"; npm run db:bootstrap
   # (Or `npm run db:seed` instead to load sample records for a demo.)
   ```
4. **Vercel**: sign up → "Import project" → pick the repo. Add three
   environment variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and
   `SESSION_SECRET` (see `.env.example` for how to generate one). Deploy.
5. Open the URL on your phone → browser menu → **Add to Home Screen**.
   It installs with the Illumin8 icon and runs full-screen like an app.

Note: Vercel's free Hobby tier is licensed for non-commercial use; for a
business tool the Pro plan ($20/mo) is the by-the-book choice.

### Option B — Railway / Fly.io (~$5/mo, no Turso)

Run it as one always-on container with a persistent volume mounted at
`/app/data` — the SQLite file just works, no env vars beyond `SESSION_SECRET`.
Simple and business-license-clean; slightly more setup (a Dockerfile).

### QR codes → leads

Every campaign has a public sign-up page at `/join/<token>` (no login) and its
QR code is displayed on the campaign detail page (Download PNG to print).
Scans open a branded mobile form; submissions become Leads with source
"QR Code", attributed to the campaign, partner, and business automatically.
Create one campaign per placement (lunch-and-learn slides, website, in-office
ads) so each surface reports separately. **Print QR codes from the deployed
site, not localhost** — the code encodes the domain it was viewed on.

### Team members

Settings → **Team** (admins only): add users with a name, email, temporary
password, and role (Admin or Member). Everyone shares the same outreach data;
admins additionally manage users and settings. New teammates change their
password in Settings → Profile after first sign-in.

## Deliberate boundaries

- **Not an EHR.** No health information, diagnoses, or clinical notes — outreach
  attribution and business development only. Lead/appointment notes fields say so.
- Appointment tracking is for **attribution and performance**, not scheduling; the
  clinic's real scheduler remains the source of truth.

## Which database a command touches

One convention, every script. **A bare command never touches production.**

| Command | Target | Notes |
| --- | --- | --- |
| `npm run db:migrate` | LOCAL | applies pending migrations to `data/outreach.db` |
| `npm run db:migrate -- --prod` | PRODUCTION | banner names the host before anything runs |
| `npm run db:seed` | LOCAL | demo data |
| `npm run db:seed -- --prod` | **refused** | demo data must never reach the live CRM |
| `npm run db:bootstrap` | LOCAL | admin + city + goals, only if the database is empty |
| `npm run db:bootstrap -- --prod` | PRODUCTION | the documented first-deploy step |
| `npm run db:reset` | LOCAL only | refuses whenever any Turso config is present |
| `npx tsx scripts/create-agent-user.ts --city "X"` | LOCAL | dry run |
| `… --city "X" --apply` | LOCAL | creates the identity |
| `… --city "X" --rotate --apply --prod` | PRODUCTION | rotates that city's bearer credential |

Rules the shared resolver (`src/db/target.ts`) enforces:

- Production intent is spelled **exactly** `--prod`. `--production`, `--live`, `--turso` and
  unknown flags are **refused**, never quietly treated as local.
- `--prod` with no `TURSO_DATABASE_URL` **refuses** rather than falling back to local — a
  silent fallback would report success while production stayed untouched.
- In local mode the resolver **deletes** `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from the
  process. `src/db/index.ts` picks its driver from that variable, so the hosted database is not
  merely unselected, it is unreachable. That is the actual guarantee; the banner is just courtesy.
- Every production banner names the host. None of them ever prints an auth token, a database
  secret, or a credential hash.

## Traps worth knowing before you touch this

Hard-won, each one having actually bitten:

- **Backing up the local SQLite file needs a WAL checkpoint.** `data/outreach.db` runs in
  WAL mode, so recent writes live in `outreach.db-wal` until they are checkpointed. A plain
  `cp data/outreach.db backup.db` silently captures a *stale* database — a backup taken this
  way once read 21 rows against a live 19, which looks exactly like data loss when you
  compare them. Copy `data/outreach.db*` (all three files), or run
  `PRAGMA wal_checkpoint(TRUNCATE);` first. The same reason `.gitignore` uses `data/*.db*`
  rather than `data/*.db`.

- **`drizzle-kit generate` is not trusted here.** The meta snapshots for migrations 0007–0012
  were never created, so it diffs against 0006 and tries to replay six migrations — its output
  once included `DROP TABLE campaigns`. Migrations 0007 onward are hand-written. Always read
  generated SQL before applying it, and never run `drizzle-kit push`.

- **`npm run db:migrate` used to target PRODUCTION.** `loadEnvLocal()` reads `.env.turso`
  before `.env.local`, so `TURSO_DATABASE_URL` is set on every dev machine and the plain
  command silently migrated Turso. This was written down here as a warning and the warning
  still failed — a local-only migration landed on production anyway. The script now decides by
  flag rather than by environment:

  ```
  npm run db:migrate            # LOCAL data/outreach.db, always
  npm run db:migrate -- --prod  # hosted Turso, printed loudly before it runs
  ```

  Without `--prod` a configured `TURSO_DATABASE_URL` is ignored and said so out loud. With
  `--prod` and no URL configured, it refuses rather than quietly migrating the local file.

  The same trap existed in `create-agent-user`, `db:seed` and `db:bootstrap`, and all three now
  use the same resolver — see the command matrix above. `db:reset` was already safe.

- **Foreign keys are enforced on BOTH drivers — but only one asks for it.** better-sqlite3
  defaults `foreign_keys` to OFF, which is why `src/db/index.ts` sets it; hosted Turso pins it
  ON and ignores `PRAGMA foreign_keys = OFF` entirely (verified against the live database).
  Do not assume a constraint is decorative in production. The practical consequence: deleting a
  row that agent ledger entries reference will fail in production too, so anything that deletes
  events or accounts has to clear `agent_activities` first.

- **Transactions are not reliable across the two drivers.** The local better-sqlite3 handle is
  cast to the libsql type, and its `transaction()` is synchronous — an async callback commits
  before a thrown error can roll anything back (verified: a forced failure left the row). The
  production libsql driver *is* async. Code that needs atomicity would therefore behave
  differently in production than locally, so nothing here depends on it.

- **Timestamps are local time, not UTC.** Columns default to `datetime('now','localtime')`.
  Comparing them against a cutoff built from `toISOString()` is wrong by the machine's offset —
  on a UTC-6 host that made every agent run look six hours old the moment it was created.
  Parse stored stamps as local (`Date.parse(s.replace(" ", "T"))`).

- **Unlayered CSS beats Tailwind utilities.** `globals.css` rules written outside `@layer`
  win over any layered utility regardless of specificity. That is why `.no-scrollbar` exists
  as a rule rather than a utility, and why the grid `min-width` reset lives in `@layer base`.
