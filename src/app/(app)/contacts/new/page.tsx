import { PageHeader } from "@/components/ui";
import ContactForm from "@/components/forms/ContactForm";
import { createContact } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "New Contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const accountId = spStr(sp, "accountId");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Contact" />
      <ContactForm action={createContact} defaultAccountId={accountId ? Number(accountId) : undefined} />
    </div>
  );
}
