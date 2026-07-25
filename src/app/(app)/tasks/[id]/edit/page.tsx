import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader, Card, Field, inputCls, Btn } from "@/components/ui";
import { updateTask } from "@/app/actions";

export const metadata = { title: "Edit Task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await db.query.tasks.findFirst({ where: eq(s.tasks.id, Number(id)) });
  if (!task) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit Task" />
      <form action={updateTask}>
        <input type="hidden" name="id" value={task.id} />
        <Card className="p-6">
          <div className="grid gap-4">
            <Field label="What needs to happen?">
              <input name="title" required defaultValue={task.title} className={inputCls} />
            </Field>
            <Field label="Due date">
              <input name="dueDate" type="date" defaultValue={task.dueDate?.slice(0, 10) ?? ""} className={inputCls} />
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={2} defaultValue={task.notes ?? ""} className={inputCls} />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Btn type="submit">Save changes</Btn>
          </div>
        </Card>
      </form>
    </div>
  );
}
