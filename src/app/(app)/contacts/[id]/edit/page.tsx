import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import ContactForm from "@/components/forms/ContactForm";
import { updateContact } from "@/app/actions";

export const metadata = { title: "Edit Contact" };

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await authorize(await db.query.contacts.findFirst({ where: eq(s.contacts.id, Number(id)) }));
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${contact.firstName} ${contact.lastName}`} />
      <ContactForm action={updateContact} contact={contact} />
    </div>
  );
}
