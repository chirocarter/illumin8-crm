import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import EventForm from "@/components/forms/EventForm";
import { updateEvent } from "@/app/actions";

export const metadata = { title: "Edit Event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await authorize(await db.query.events.findFirst({ where: eq(s.events.id, Number(id)) }));
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${event.name}`} />
      <EventForm action={updateEvent} event={event} />
    </div>
  );
}
