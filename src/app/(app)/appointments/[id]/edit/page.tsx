import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import AppointmentForm from "@/components/forms/AppointmentForm";
import { updateAppointment } from "@/app/actions";

export const metadata = { title: "Edit Appointment" };

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appointment = await db.query.appointments.findFirst({ where: eq(s.appointments.id, Number(id)) });
  if (!appointment) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit Appointment · ${appointment.personName || "Unnamed"}`} />
      <AppointmentForm action={updateAppointment} appointment={appointment} />
    </div>
  );
}
