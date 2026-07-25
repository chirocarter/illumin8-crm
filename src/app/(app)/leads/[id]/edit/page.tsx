import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import LeadForm from "@/components/forms/LeadForm";
import { updateLead } from "@/app/actions";

export const metadata = { title: "Edit Lead" };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await db.query.leads.findFirst({ where: eq(s.leads.id, Number(id)) });
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${lead.firstName} ${lead.lastName}`} />
      <LeadForm action={updateLead} lead={lead} />
    </div>
  );
}
