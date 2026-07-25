import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import AccountForm from "@/components/forms/AccountForm";
import { updateAccount } from "@/app/actions";

export const metadata = { title: "Edit Account" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await db.query.accounts.findFirst({ where: eq(s.accounts.id, Number(id)) });
  if (!account) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${account.name}`} />
      <AccountForm action={updateAccount} account={account} />
    </div>
  );
}
