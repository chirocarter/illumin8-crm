import { PageHeader } from "@/components/ui";
import EventForm from "@/components/forms/EventForm";
import { createEvent } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "New Event" };
export const dynamic = "force-dynamic";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const n = (k: string) => {
    const v = spStr(sp, k);
    return v ? Number(v) : undefined;
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Event" />
      <EventForm action={createEvent}
        defaults={{
          accountId: n("accountId"), contactId: n("contactId"), opportunityId: n("opportunityId"),
          partnerId: n("partnerId"), campaignId: n("campaignId"),
          // ?startsAt=YYYY-MM-DDTHH:mm and ?type= — set when adding from a calendar day
          startsAt: spStr(sp, "startsAt"),
          type: spStr(sp, "type"),
        }} />
    </div>
  );
}
