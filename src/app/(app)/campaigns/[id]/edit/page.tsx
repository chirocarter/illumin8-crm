import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import CampaignForm from "@/components/forms/CampaignForm";
import { updateCampaign } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Edit Campaign" };

export default async function EditCampaignPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const campaign = await authorize(await db.query.campaigns.findFirst({ where: eq(s.campaigns.id, Number(id)) }));
  if (!campaign) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${campaign.name}`} />
      <CampaignForm action={updateCampaign} campaign={campaign}
        defaults={{ publicForm: spStr(sp, "form") }}
        screeningError={spStr(sp, "screeningError")} />
    </div>
  );
}
