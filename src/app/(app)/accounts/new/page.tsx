import { PageHeader } from "@/components/ui";
import AccountForm from "@/components/forms/AccountForm";
import { createAccount } from "@/app/actions";

export const metadata = { title: "New Account" };

export default function NewAccountPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Account" subtitle="Add a business to the outreach engine" />
      <AccountForm action={createAccount} />
    </div>
  );
}
