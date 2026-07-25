import { PageHeader } from "@/components/ui";
import CampaignForm from "@/components/forms/CampaignForm";
import { createCampaign } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "New Campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const partnerId = spStr(sp, "partnerId");
  const accountId = spStr(sp, "accountId");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Campaign" />
      <CampaignForm action={createCampaign}
        defaults={{ partnerId: partnerId ? Number(partnerId) : undefined, accountId: accountId ? Number(accountId) : undefined }} />
    </div>
  );
}
