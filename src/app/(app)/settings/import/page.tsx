import { PageHeader, Card, CardHeader, Field, Btn, inputCls, selectCls } from "@/components/ui";
import { importCSV } from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "CSV Import" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const imported = spStr(sp, "imported");
  const error = spStr(sp, "error");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="CSV Import" subtitle="Bring in businesses and contacts from ClickUp or spreadsheets" />

      {imported && <p className="mb-4 rounded-xl bg-good-soft px-4 py-2.5 text-sm font-medium text-good">Imported {imported} records.</p>}
      {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-2.5 text-sm font-medium text-bad">
        {error === "empty" ? "That file appears to be empty." : "Choose a file and record type first."}</p>}

      <Card>
        <CardHeader title="Upload" />
        <form action={importCSV} className="space-y-4 px-5 pb-5">
          <Field label="What are you importing?">
            <select name="entity" className={selectCls}>
              <option value="accounts">Accounts (businesses)</option>
              <option value="contacts">Contacts (people)</option>
            </select>
          </Field>
          <Field label="CSV file" hint="First row must be headers. Recognized columns for accounts: name, vertical, area, address, website, phone, email, status, source, notes. For contacts: first name, last name, title, phone, email, type, source, notes.">
            <input name="file" type="file" accept=".csv,text/csv" required className={inputCls} />
          </Field>
          <div className="flex justify-end"><Btn type="submit">Import</Btn></div>
        </form>
      </Card>
    </div>
  );
}
