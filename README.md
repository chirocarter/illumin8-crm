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
- Weeks run **Monday–Sunday**.

## Deploying (use it on your phone, add teammates)

The app runs in two database modes with zero code changes:

- **Local (default):** SQLite file at `data/outreach.db`.
- **Hosted:** set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` and it talks to
  [Turso](https://turso.tech) (hosted SQLite) instead. This is the deploy path.

### Option A — Vercel + Turso (recommended)

1. Push this folder to a GitHub repo.
2. **Turso** (the database): sign up at turso.tech → create a database →
   copy its URL (`libsql://…`) and create an auth token.
3. Apply schema + sample data to it from this machine (PowerShell):
   ```powershell
   $env:TURSO_DATABASE_URL="libsql://…"; $env:TURSO_AUTH_TOKEN="…"
   npm run db:migrate
   npm run db:seed   # optional — or start empty and skip this
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
