import { PageHeader } from "@/components/ui";
import AccountForm from "@/components/forms/AccountForm";
import { createAccount } from "@/app/actions";
import { spStr, type SP } from "@/lib/lists";
import { ACCOUNT_STATUSES, ACTIVE_PARTNER } from "@/lib/taxonomy";

export const metadata = { title: "New Account" };

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // Only a real status is honored; anything else falls back to the form's default.
  const requested = spStr(sp, "status");
  const status = (ACCOUNT_STATUSES as readonly string[]).includes(requested ?? "") ? requested : undefined;
  const isPartner = status === ACTIVE_PARTNER;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={isPartner ? "New Partner" : "New Account"}
        subtitle={isPartner ? "Add a business that's already partnering with us" : "Add a business to the outreach engine"} />
      <AccountForm action={createAccount} defaultStatus={status} />
    </div>
  );
}
