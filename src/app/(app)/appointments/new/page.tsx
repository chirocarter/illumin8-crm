import { PageHeader } from "@/components/ui";
import AppointmentForm from "@/components/forms/AppointmentForm";
import { createAppointment } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "New Appointment" };
export const dynamic = "force-dynamic";

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const n = (k: string) => {
    const v = spStr(sp, k);
    return v ? Number(v) : undefined;
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New Appointment" subtitle="Outreach attribution only — the clinic's scheduler stays the source of truth" />
      <AppointmentForm action={createAppointment}
        defaults={{ leadId: n("leadId"), eventId: n("eventId"), campaignId: n("campaignId"), partnerId: n("partnerId"), accountId: n("accountId"), locationId: n("locationId"), source: spStr(sp, "source") }} />
    </div>
  );
}
