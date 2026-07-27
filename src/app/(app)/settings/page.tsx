import { PageHeader, Card, CardHeader, Field, inputCls, selectCls, Btn, BtnLink, Badge } from "@/components/ui";
import { addCity, addLocation, addTag, addUser, deleteTag, deleteUser, saveGoals, setUserCity, setUserRole, switchCity, toggleLocation, updateProfile } from "@/app/actions";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { activeCity, allCities } from "@/lib/scope";
import {
  ACCOUNT_STATUSES, APPOINTMENT_STATUSES, CAMPAIGN_TYPES, EVENT_TYPES,
  LEAD_APPT_STATUSES, OPPORTUNITY_STAGES,
} from "@/lib/taxonomy";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const [locations, goals, tags, team, cities, current] = await Promise.all([
    db.query.locations.findMany(),
    db.query.reportGoals.findMany({ orderBy: (g, { asc }) => [asc(g.sortOrder)] }),
    db.query.tags.findMany(),
    isAdmin ? db.query.users.findMany({ orderBy: (u, { asc }) => [asc(u.name)] }) : Promise.resolve([]),
    allCities(),
    activeCity(),
  ]);
  const cityName = (id: number | null) => cities.find((c) => c.id === id)?.name ?? "—";

  const error = spStr(sp, "error");
  const ERROR_TEXT: Record<string, string> = {
    password: "Current password was incorrect — password not changed.",
    userinput: "Name, email, and a password of at least 8 characters are required.",
    userexists: "A user with that email already exists.",
    self: "You can't remove or demote your own account.",
    admin: "Only admins can do that.",
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" actions={<BtnLink variant="outline" href="/settings/import">CSV Import</BtnLink>} />
      {spStr(sp, "saved") && <p className="mb-4 rounded-xl bg-good-soft px-4 py-2.5 text-sm font-medium text-good">Saved.</p>}
      {error && ERROR_TEXT[error] && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-2.5 text-sm font-medium text-bad">{ERROR_TEXT[error]}</p>}

      {/* Active city — the market every list, picker and search is pinned to. */}
      <Card className="mb-5">
        <CardHeader title="City" action={
          <span className="hidden text-xs text-faint sm:inline">
            {isAdmin ? "Switching changes which city's records you work in" : "Set by an admin"}
          </span>
        } />
        <div className="px-5 pb-5">
          <p className="text-sm text-soft">
            You're working in <span className="font-semibold text-ink">{current?.name ?? "no city yet"}</span>.
            Lists, search and pickers show only this city. Cross-city numbers live on the{" "}
            <a href="/reports/performance?scope=org" className="font-medium text-accent-deep hover:underline">Performance Report</a>.
          </p>

          {isAdmin && (
            <>
              <div className="mt-3.5 flex flex-wrap gap-2">
                {cities.map((c) => (
                  <form key={c.id} action={switchCity}>
                    <input type="hidden" name="cityId" value={c.id} />
                    <button type="submit"
                      className={`rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
                        c.id === current?.id
                          ? "pill-active"
                          : "border border-line bg-card text-soft hover:bg-hairline hover:text-ink-hover"
                      }`}>
                      {c.name}
                    </button>
                  </form>
                ))}
              </div>
              <form action={addCity} className="mt-4 flex items-end gap-2 border-t border-hairline pt-4">
                <Field label="Add a city" className="flex-1">
                  <input name="name" required className={inputCls} placeholder="e.g. Santa Fe" />
                </Field>
                <Btn type="submit" variant="outline">Add</Btn>
              </form>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader title="Profile" />
          <form action={updateProfile} className="space-y-3 px-5 pb-5">
            <Field label="Name"><input name="name" defaultValue={user.name} className={inputCls} /></Field>
            <Field label="Email"><input value={user.email} disabled className={inputCls + " opacity-60"} /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Current password"><input name="currentPassword" type="password" className={inputCls} /></Field>
              <Field label="New password"><input name="newPassword" type="password" className={inputCls} /></Field>
            </div>
            <div className="flex justify-end"><Btn type="submit" variant="outline">Save profile</Btn></div>
          </form>
        </Card>

        {/* Weekly goals */}
        <Card>
          <CardHeader title="Weekly Goals" />
          <form action={saveGoals} className="px-5 pb-5">
            <div className="space-y-2.5">
              {goals.map((g) => (
                <label key={g.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-soft">{g.label}</span>
                  <input name={`goal_${g.id}`} type="number" min="0" defaultValue={g.weeklyTarget}
                    className="w-24 rounded-xl border border-line bg-card px-3.5 py-2 text-right text-sm outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft" />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end"><Btn type="submit" variant="outline">Save goals</Btn></div>
          </form>
        </Card>

        {/* Locations */}
        <Card>
          <CardHeader title="Illumin8 Locations" action={<span className="hidden text-xs text-faint sm:inline">Clinics, grouped by city</span>} />
          <ul className="space-y-1 px-5">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl py-1.5 text-sm">
                <span className="min-w-0">
                  <span className={l.active ? "font-medium" : "text-faint line-through"}>{l.name}</span>
                  <span className="ml-2 text-xs text-faint">{cityName(l.cityId)}</span>
                </span>
                <form action={toggleLocation}>
                  <input type="hidden" name="id" value={l.id} />
                  <button type="submit" className="text-xs font-medium text-accent-deep hover:underline">
                    {l.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addLocation} className="flex items-end gap-2 px-5 pb-5 pt-3">
            <Field label={`Add location in ${current?.name ?? "this city"}`} className="flex-1">
              <input name="name" required className={inputCls} placeholder="e.g. North Valley" />
            </Field>
            <Btn type="submit" variant="outline">Add</Btn>
          </form>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader title="Tags" />
          <div className="flex flex-wrap gap-2 px-5">
            {tags.map((t) => (
              <form key={t.id} action={deleteTag} className="group">
                <input type="hidden" name="id" value={t.id} />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-hairline px-2.5 py-0.5 text-xs font-medium text-soft">
                  {t.name}
                  <button type="submit" title="Delete tag" className="text-faint transition-colors hover:text-bad">×</button>
                </span>
              </form>
            ))}
          </div>
          <form action={addTag} className="flex items-end gap-2 px-5 pb-5 pt-3">
            <Field label="Add tag" className="flex-1">
              <input name="name" required className={inputCls} placeholder="e.g. Bilingual" />
            </Field>
            <Btn type="submit" variant="outline">Add</Btn>
          </form>
        </Card>
      </div>

      {/* Team (admin only) */}
      {isAdmin && (
        <Card className="mt-5">
          <CardHeader title="Team" action={<span className="hidden text-xs text-faint sm:inline">Members see only their city; admins can switch</span>} />
          <ul className="divide-y divide-hairline px-5">
            {team.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-deep">
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.name}{u.id === user.id && <span className="text-faint"> (you)</span>}</span>
                  <span className="block truncate text-xs text-soft">{u.email}</span>
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  u.role === "admin" ? "bg-accent-soft text-accent-deep" : "bg-hairline text-soft"}`}>
                  {u.role === "admin" ? "Admin" : "Member"}
                </span>
                {/* Which city this person works — for members it's also what they can see. */}
                <form action={setUserCity}>
                  <input type="hidden" name="id" value={u.id} />
                  <select name="cityId" defaultValue={u.cityId ?? ""}
                    className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-soft outline-none focus:border-accent">
                    <option value="">No city</option>
                    {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="submit" className="ml-1.5 text-xs font-medium text-accent-deep hover:underline">Set</button>
                </form>
                {u.id !== user.id && (
                  <span className="flex items-center gap-2">
                    <form action={setUserRole}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="role" value={u.role === "admin" ? "user" : "admin"} />
                      <button type="submit" className="text-xs font-medium text-accent-deep hover:underline">
                        {u.role === "admin" ? "Make member" : "Make admin"}
                      </button>
                    </form>
                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit" className="text-xs font-medium text-bad hover:underline">Remove</button>
                    </form>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <form action={addUser} className="border-t border-hairline px-5 py-4">
            <p className="mb-3 text-sm font-medium">Add a team member</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Name"><input name="name" required className={inputCls} /></Field>
              <Field label="Email"><input name="email" type="email" required className={inputCls} /></Field>
              <Field label="Temporary password" hint="Min 8 characters — they change it after first sign-in">
                <input name="password" required minLength={8} className={inputCls} />
              </Field>
              <Field label="Role">
                <select name="role" defaultValue="user" className={selectCls}>
                  <option value="user">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="City" hint="Members only ever see this city's records">
                <select name="cityId" defaultValue={current?.id ?? ""} className={selectCls}>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex justify-end"><Btn type="submit" variant="outline">Add user</Btn></div>
          </form>
        </Card>
      )}

      {/* Taxonomies (read-only reference) */}
      <Card className="mt-5">
        <CardHeader title="Workflow Vocabulary" action={<span className="hidden text-xs text-faint sm:inline">Defined in src/lib/taxonomy.ts so reports stay deterministic</span>} />
        <div className="grid gap-5 px-5 pb-5 md:grid-cols-2">
          {([
            ["Opportunity stages", OPPORTUNITY_STAGES],
            ["Event types", EVENT_TYPES],
            ["Campaign types", CAMPAIGN_TYPES],
            ["Account statuses", ACCOUNT_STATUSES],
            ["Lead statuses", LEAD_APPT_STATUSES],
            ["Appointment statuses", APPOINTMENT_STATUSES],
          ] as [string, readonly string[]][]).map(([title, values]) => (
            <div key={title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{title}</p>
              <div className="flex flex-wrap gap-1.5">
                {values.map((v) => <Badge key={v}>{v}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
