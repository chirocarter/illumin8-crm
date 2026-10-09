# Agent event API — contract for the research agent

How an external research agent (the Make workflow) finds, proposes and refreshes
community **events** in the CRM. Everything below is enforced by the server;
the regression tests in `tests/event-research.test.ts` pin it down
(`npm run test:event-research`).

## Ground rules (server-enforced, not conventions)

- **Every agent-created event is born `status: "Idea"` and `aiReviewStatus: "Pending"`**,
  with no booking date. There is no input that can set status, booking, review
  or ownership — sending one of those fields is a `400`, not a silent ignore.
- **Pending candidates are invisible to the business** until a person approves
  them on the AI Agent page: they're on no calendar, in no events list, and in
  no Performance Report total.
- **Approval is not booking, and not contact.** Approving marks the event as
  worth pursuing. It does not book it, change its status, or reach out to the
  organizer. A person does those.
- **Unknown stays unknown.** If a date, attendance figure or cost isn't
  published, omit the field. Never estimate or fill a placeholder: an omitted
  `startsAt` is shown as "date not published yet", an omitted
  `estimatedAttendance` shows nothing, and an undated event is fully supported.
- **One city per credential.** The agent's city comes from its credential.
  No endpoint accepts a city; another city's events answer `404`, exactly as if
  they didn't exist.

## Authentication

Every request carries the agent's credential:

```
Authorization: Bearer i8a_…
```

| Status | Meaning |
|---|---|
| `401` | Missing, malformed or unknown credential |
| `403` | The identity has no city, or its city is inactive |
| `500` | The server's agent-key secret isn't configured (auth fails closed) |

Never log or echo the credential.

## Runs — every write belongs to one

Writes (create, research refresh) require an open run owned by this agent.

| | |
|---|---|
| Start | `POST /api/agent/runs` with `{"trigger": "manual" \| "scheduled" \| "test"}` (default `manual`) → `201` `{ id, status: "running", trigger, startedAt, completedAt: null, error: null, city }` |
| Finish | `POST /api/agent/runs/:id/complete` with `{"status": "completed"}` or `{"status": "failed", "error": "…≤500 chars"}` → `200` with `counts` per action |
| Limits | 1 open run per agent · 10 runs per 24h · a run stops accepting writes after **6 hours** · 1,000 ledger entries per run |
| Errors | `409` "already has a run in progress" (with `openRunId`) or daily cap · writes to a finished run → `409` · a stale run → `409` · someone else's run → `404` |

Always complete the run, including on failure, so the next one can start.

## Event types

`type` must be one of the **outreach** types:

`Lunch and Learn` · `Gym Screening` · `Community Event` (default) · `Expo / Booth` ·
`Dental CE / Ergonomics Presentation` · `Office Visit` · `Partner Event` · `Other`

`Meeting`, `Internal Meeting` and `Time Off / Away` are calendar-only and are
refused; the agent API can't see events of those types either.

## Research fields (`aiResearch`)

A JSON object. **Unknown keys are dropped** (so a new field won't break a write,
but it won't be stored either). `null` means absent. Any **invalid** value
rejects the whole request with a `400` naming the field; values are never
coerced (`"about 500"` is not a number).

| Field | Type & limit | Shown to people |
|---|---|---|
| `summary` | string ≤ 2,000 | Review card, event page |
| `confidence` | `"low"` \| `"medium"` \| `"high"` | Review card, event page |
| `organizer` | string ≤ 300 | Review card, event page |
| `organizerContact` | string ≤ 300 | Review card, event page — see below |
| `vendorStatus` | string ≤ 300 | Review card, event page |
| `vendorCost` | string ≤ 300, free text (`"$250 per 10x10 booth"`, `"Not published"`) | Review card, event page |
| `recommendedAction` | string ≤ **500** | Review card and event page, as "Suggested: …" |
| `estimatedAttendance` | integer 0–10,000,000 | Event page |
| `potential` | object; keys `patient`, `employer`, `brand`; each an integer 0–100 or a string ≤ 120 | Review card, event page |
| `sources` | array ≤ 10 of `{ url, label? }` — `url` required, **http/https only**, ≤ 500; `label` ≤ 120 | Review card, event page |
| `researchedAt`, `model` | string ≤ 120 | Stored only |
| `changeLog` | array ≤ 50 of `{ at ≤ 120, note ≤ 300, source? http(s) ≤ 500 }` | Event page |

The whole stored object must stay under **12,000 bytes**.

**`organizerContact` is treated as untrusted text.** It's displayed escaped, and
only three kinds of piece become links: an `http(s)://` URL, an email address
(`mailto:`), and a 10–15 digit phone number (`tel:`). Anything else, including
`javascript:` or `data:` URLs, stays plain text. Put the contact in one line,
for example `"Jane Roe, Vendor Coordinator, jane@abqexpo.org, (505) 555-0142, https://abqexpo.org/vendors"`.

**`recommendedAction` is advice to a person.** Nothing in the CRM acts on it:
"Book a booth" does not book anything.

## Endpoints

### `GET /api/agent/events/search` — look before you propose

Query parameters (at least one of `q`, `date`, `venue`):

| Param | Rule |
|---|---|
| `q` | name text, ≤ 120 chars |
| `date` | `YYYY-MM-DD` — any event starting that day |
| `venue` | location text, ≤ 120 chars |
| `limit` | 1–25 (default 10; larger is clamped) |

Criteria are OR'd. Each match says which criteria it met in `matchedOn`
(`name`, `nameExact` = same normalized name, `date`, `venue`).

```json
{
  "city": "Albuquerque", "count": 1, "limit": 10, "maxLimit": 25, "truncated": false,
  "matches": [{
    "id": 412, "name": "ABQ Health & Wellness Expo", "normalizedName": "abq health and wellness expo",
    "type": "Expo / Booth", "status": "Idea", "startsAt": "2027-03-14T00:00:00", "endsAt": null,
    "locationText": "Expo New Mexico", "expectedAttendees": 0, "applicationDeadline": "2027-02-01",
    "aiFitScore": 80, "aiReviewStatus": "Pending", "matchedOn": ["name", "nameExact"]
  }]
}
```

### `GET /api/agent/events/:id` — one event, with its stored research

`200` `{ city, event }`, where `event` has `id, name, normalizedName, type, status,
startsAt, endsAt, locationText, expectedAttendees, applicationDeadline,
aiFitScore, aiResearch (object or null), agentRunId, aiReviewStatus,
aiReviewReason, createdAt`. `404` for a missing event, another city's event,
or a calendar-only type.

### `POST /api/agent/events` — propose an event for review

| Field | Rule |
|---|---|
| `agentRunId` | **required** — your open run |
| `name` | **required**, ≤ 200, must contain a distinguishing word (`"2027"` alone is refused) |
| `type` | an outreach type (above); default `Community Event` |
| `startsAt` | omit or `null` if unpublished. `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm` or `…:ss`; a real calendar date; **not in the past**; ≤ 3 years ahead. Stored as `YYYY-MM-DDTHH:mm:ss` (a bare date becomes `T00:00:00`) |
| `endsAt` | same format; requires `startsAt` and must be after it |
| `applicationDeadline` | `YYYY-MM-DD` |
| `locationText` | string; trimmed and cut to 300 |
| `expectedAttendees` | integer 0–10,000,000; omit when unknown (stored as 0 = not known) |
| `aiFitScore` | integer 0–100; omit when unscored |
| `aiResearch` | object — see Research fields |

**Refused with `400` if present:** `status, bookedAt, cityId, userId, city, user,
actualAttendees, screeningsCompleted, revenue, outcomeNotes, followUpRequired,
followUpDueAt, notes, aiReviewStatus, aiReviewReason, aiReviewedAt, aiReviewedBy,
accountId, contactId, opportunityId, campaignId, partnerId, clinicLocationId`.

Request:

```json
{
  "agentRunId": 57,
  "name": "ABQ Health & Wellness Expo",
  "type": "Expo / Booth",
  "startsAt": "2027-03-14",
  "locationText": "Expo New Mexico",
  "applicationDeadline": "2027-02-01",
  "aiFitScore": 80,
  "aiResearch": {
    "summary": "Large consumer health expo with a vendor hall.",
    "confidence": "medium",
    "organizer": "ABQ Expo Group",
    "organizerContact": "Jane Roe, jane@abqexpo.org, (505) 555-0142, https://abqexpo.org/vendors",
    "vendorStatus": "Vendor applications open",
    "vendorCost": "$250 per 10x10 booth",
    "recommendedAction": "Apply for a booth before Feb 1; ask whether health screenings are allowed.",
    "potential": { "patient": 70, "employer": 30, "brand": 60 },
    "sources": [{ "url": "https://abqexpo.org/2027", "label": "Expo site" }],
    "researchedAt": "2026-10-09", "model": "research-agent-v1"
  }
}
```

`201` — created:

```json
{
  "created": true, "id": 412, "name": "ABQ Health & Wellness Expo",
  "normalizedName": "abq health and wellness expo", "type": "Expo / Booth",
  "status": "Idea", "startsAt": "2027-03-14T00:00:00", "endsAt": null,
  "locationText": "Expo New Mexico", "expectedAttendees": 0,
  "applicationDeadline": "2027-02-01", "applicationDeadlinePassed": false,
  "aiFitScore": 80, "aiReviewStatus": "Pending", "city": "Albuquerque",
  "candidatesChecked": 3
}
```

If an existing event in the same city shares the venue but not the name, the
`201` also carries `"venueCollisionWith": { "eventId": 398, "name": "…" }`. That's
a heads-up only. The venue hosts many events, so it never blocks.

`409` — duplicate, **nothing created** (logged as `duplicate_skipped`):

```json
{
  "created": false, "duplicateOf": 412, "matchedOn": ["name", "date"],
  "existing": { "id": 412, "name": "ABQ Health & Wellness Expo", "normalizedName": "abq health and wellness expo",
    "type": "Expo / Booth", "status": "Idea", "startsAt": "2027-03-14T00:00:00",
    "locationText": "Expo New Mexico", "applicationDeadline": "2027-02-01", "aiReviewStatus": "Pending" },
  "candidatesChecked": 3
}
```

When you get a `409`, refresh the existing event with the research endpoint
instead of re-creating it.

**How duplicates are decided:** within the agent's city only, among outreach
events, by **exact equality of normalized names**. Normalizing lowercases, turns
`&` into "and", and drops punctuation, years, ordinals ("3rd") and filler words
("the", "annual", "official"…). So "The 3rd Annual ABQ Health and Wellness Expo 2027"
is the same as "ABQ Health & Wellness Expo". The candidates compared are:
- **dated proposals:** events within ±1 day, plus every undated event;
- **undated proposals:** undated events and events in the next 2 years.

`matchedOn` is `["name","date"]` or `["name","undated"]`. Another city's event
with the same name is not a duplicate.

### `PATCH /api/agent/events/:id/research` — refresh what you know

Updates **only** `aiFitScore`, `aiResearch` and `applicationDeadline`. Works on
Pending, Approved and Rejected events; it can never change review status,
lifecycle status, dates, venue or anything a person owns.

| Field | Rule |
|---|---|
| `agentRunId` | **required** |
| `aiFitScore` | integer 0–100 |
| `aiResearch` | object — **the full current snapshot**. It replaces the stored fields, so resend everything still true (a field you leave out is cleared). Exception: `changeLog` is append-only. Entries you send are added if new, and stored history is never lost. |
| `applicationDeadline` | `YYYY-MM-DD` to set, `null` to clear |
| `development` | optional — declare a material change (below) |

At least one of `aiFitScore`, `aiResearch`, `applicationDeadline`, `development`
is required. **Refused with `400`:** `name, type, status, bookedAt, startsAt,
endsAt, locationText, notes, expectedAttendees, actualAttendees,
screeningsCompleted, revenue, outcomeNotes, followUpRequired, followUpDueAt,
accountId, contactId, opportunityId, campaignId, partnerId, clinicLocationId,
cityId, userId, aiReviewStatus, aiReviewReason, aiReviewedAt, aiReviewedBy`.
If research suggests one of those is wrong, report it as a development.

`development` = `{ kind, detail (required, ≤ 300), occurredAt? (YYYY-MM-DD), sources? (≤ 10, http/https) }`,
with `kind` one of: `vendor_registration_opened, sponsorship_opened,
booth_pricing_published, application_deadline_announced,
application_deadline_changed, organizer_identified, event_date_changed,
audience_information_published, attendance_estimate_changed, event_expanded,
event_reopened, event_cancelled, cancellation_reversed,
participation_rules_changed, employer_component_announced`. Only declare one
when something genuinely changed. Routine refreshes are just `researched`.
The same development reported twice in one run is recorded once.

Request:

```json
{
  "agentRunId": 57,
  "aiFitScore": 85,
  "applicationDeadline": "2027-02-15",
  "aiResearch": { "summary": "…", "confidence": "high", "organizerContact": "…",
    "recommendedAction": "Apply by Feb 15 — deadline was extended.", "sources": [{ "url": "https://abqexpo.org/2027" }] },
  "development": { "kind": "application_deadline_changed", "detail": "Deadline moved from Feb 1 to Feb 15",
    "occurredAt": "2026-10-09", "sources": [{ "url": "https://abqexpo.org/news" }] }
}
```

`200`:

```json
{
  "updated": true, "id": 412, "city": "Albuquerque",
  "action": "resurfaced",
  "aiFitScore": 85, "applicationDeadline": "2027-02-15",
  "aiReviewStatus": "Pending", "status": "Idea", "bookedAt": null,
  "changeLogEntries": 1, "researchBytes": 642, "maxResearchBytes": 12000,
  "aiResearch": { "…": "the stored object, changeLog included" }
}
```

`action` is `researched` (a refresh), `resurfaced` (a declared development; it
appears under New Developments on the AI Agent page), or `already_reported` (the
same development was already logged in this run). `404` for another city's
event, a calendar-only type, or a run you don't own.

## Errors

Every error is JSON `{ "error": "…" }`, sometimes with a `hint`. `400` means
fix the request and don't retry it unchanged. `404` means not found or not
yours. `409` means a duplicate or a run-state problem. `500` means retry later.

## Change history

- **2026-10-09** — `aiResearch.recommendedAction` is now accepted, validated (≤ 500
  characters) and stored. Before this it was silently dropped as an unknown key,
  so the review card's "Suggested:" line could never appear. Additive: payloads
  that worked before work the same. `organizerContact` (already accepted) is now
  shown on review cards as well as event pages, with safe links.
