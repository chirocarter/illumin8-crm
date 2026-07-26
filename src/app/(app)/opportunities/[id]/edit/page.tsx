import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import OpportunityForm from "@/components/forms/OpportunityForm";
import { updateOpportunity } from "@/app/actions";

export const metadata = { title: "Edit Opportunity" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunity = await authorize(await db.query.opportunities.findFirst({ where: eq(s.opportunities.id, Number(id)) }));
  if (!opportunity) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${opportunity.name}`} />
      <OpportunityForm action={updateOpportunity} opportunity={opportunity} />
    </div>
  );
}
