import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { PROJECT_STATUSES } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Project = typeof schema.projects.$inferSelect;

export default async function ProjectForm({ action, project }: {
  action: (fd: FormData) => Promise<void>;
  project?: Project;
}) {
  const accounts = await db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] });
  const p = project;

  return (
    <form action={action}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Project name" className="md:col-span-2">
            <input name="name" required defaultValue={p?.name} className={inputCls}
              placeholder="e.g. Get in-network with Presbyterian Insurance" />
          </Field>
          <Field label="What's the goal?" className="md:col-span-2">
            <textarea name="description" rows={3} defaultValue={p?.description ?? ""} className={inputCls}
              placeholder="Why this matters and what done looks like" />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={p?.status ?? "Active"} className={selectCls}>
              {PROJECT_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Target date (optional)">
            <input name="targetDate" type="date" defaultValue={p?.targetDate?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="Next step" className="md:col-span-2">
            <input name="nextStep" defaultValue={p?.nextStep ?? ""} className={inputCls}
              placeholder="The single next action to move this forward" />
          </Field>
          <Field label="Related business (optional)" className="md:col-span-2">
            <select name="accountId" defaultValue={p?.accountId ?? ""} className={selectCls}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Btn type="submit">{p ? "Save changes" : "Create project"}</Btn>
        </div>
      </Card>
    </form>
  );
}
