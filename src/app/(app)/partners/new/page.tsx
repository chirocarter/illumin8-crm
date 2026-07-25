import { PageHeader } from "@/components/ui";
import PartnerForm from "@/components/forms/PartnerForm";
import { createPartner } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "New Partner" };
export const dynamic = "force-dynamic";

export default async function NewPartnerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const accountId = spStr(sp, "accountId");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Partner" subtitle="Promote a business to community partner" />
      <PartnerForm action={createPartner} defaultAccountId={accountId ? Number(accountId) : undefined} />
    </div>
  );
}
