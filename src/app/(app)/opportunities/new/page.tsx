import { PageHeader } from "@/components/ui";
import OpportunityForm from "@/components/forms/OpportunityForm";
import { createOpportunity } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "New Opportunity" };
export const dynamic = "force-dynamic";

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const accountId = spStr(sp, "accountId");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Opportunity" />
      <OpportunityForm action={createOpportunity} defaultAccountId={accountId ? Number(accountId) : undefined} />
    </div>
  );
}
