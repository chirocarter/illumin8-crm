import { PageHeader } from "@/components/ui";
import LeadForm from "@/components/forms/LeadForm";
import { createLead } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "New Lead" };
export const dynamic = "force-dynamic";

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const n = (k: string) => {
    const v = spStr(sp, k);
    return v ? Number(v) : undefined;
  };
  const qsParts = ["campaignId", "eventId", "partnerId", "accountId", "source"]
    .map((k) => (spStr(sp, k) ? `${k}=${encodeURIComponent(spStr(sp, k)!)}` : null))
    .filter(Boolean);
  const addAnotherQS = qsParts.length ? `?${qsParts.join("&")}` : "?";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Lead" subtitle="Outreach attribution only — never store health information here" />
      <LeadForm action={createLead} addAnotherQS={addAnotherQS}
        defaults={{ campaignId: n("campaignId"), eventId: n("eventId"), partnerId: n("partnerId"), accountId: n("accountId"), source: spStr(sp, "source") }} />
    </div>
  );
}
