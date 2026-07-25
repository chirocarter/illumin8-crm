import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import PartnerForm from "@/components/forms/PartnerForm";
import { updatePartner } from "@/app/actions";

export const metadata = { title: "Edit Partner" };

export default async function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await db.query.partners.findFirst({ where: eq(s.partners.id, Number(id)) });
  if (!partner) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit Partner" />
      <PartnerForm action={updatePartner} partner={partner} />
    </div>
  );
}
