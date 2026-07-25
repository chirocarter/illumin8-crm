// Reusable documents panel: list + one-line upload. Used by the Documents
// library and embedded on project / campaign / account pages (the hidden
// attach ids tie uploads to that record automatically).
import { Card, CardHeader, Btn, inputCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { uploadDocument, deleteDocument } from "@/app/actions";
import { fmtDate } from "@/lib/dates";
import type { schema } from "@/db";

type Doc = Pick<typeof schema.documents.$inferSelect, "id" | "name" | "fileName" | "mimeType" | "size" | "createdAt">;

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function typeDot(mime: string): string {
  if (mime.includes("pdf")) return "bg-bad";
  if (mime.startsWith("image/")) return "bg-info";
  if (mime.includes("word") || mime.includes("document")) return "bg-info";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "bg-good";
  return "bg-faint";
}

export default function DocumentsCard({ docs, attach, returnTo, title = "Documents", error }: {
  docs: Doc[];
  /** hidden fields tying uploads to a record, e.g. { projectId: 3 } */
  attach?: Partial<Record<"projectId" | "campaignId" | "accountId", number>>;
  returnTo: string;
  title?: string;
  error?: string;
}) {
  return (
    <Card>
      <CardHeader title={title} action={<span className="text-xs text-faint">PDF, images, docs · up to 8 MB</span>} />

      {docs.length === 0 ? (
        <p className="px-5 pb-2 text-sm text-faint">Nothing here yet — add flyers, one-pagers, paperwork.</p>
      ) : (
        <ul className="divide-y divide-hairline px-5">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${typeDot(d.mimeType)}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <a href={`/api/documents/${d.id}`} target="_blank"
                  className="block truncate text-sm font-medium transition-colors hover:text-accent-deep">
                  {d.name}
                </a>
                <span className="block truncate text-xs text-soft">{fmtBytes(d.size)} · {fmtDate(d.createdAt)}</span>
              </span>
              <a href={`/api/documents/${d.id}?download=1`} title="Download"
                className="shrink-0 rounded-full p-1.5 text-soft transition-colors hover:bg-hairline hover:text-ink-hover">
                <Icon name="download" className="h-4 w-4" />
              </a>
              <form action={deleteDocument}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" title="Delete"
                  className="shrink-0 rounded-full px-2 py-1 text-sm font-medium text-faint transition-colors hover:bg-bad-soft hover:text-bad">
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={uploadDocument} className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3.5">
        <input type="hidden" name="returnTo" value={returnTo} />
        {attach?.projectId && <input type="hidden" name="projectId" value={attach.projectId} />}
        {attach?.campaignId && <input type="hidden" name="campaignId" value={attach.campaignId} />}
        {attach?.accountId && <input type="hidden" name="accountId" value={attach.accountId} />}
        <input type="file" name="file" required
          className="min-w-0 flex-1 text-sm text-soft file:mr-3 file:rounded-full file:border-0 file:bg-hairline file:px-3.5 file:py-1.5 file:text-[0.8rem] file:font-medium file:text-ink hover:file:bg-line" />
        <input name="name" placeholder="Name (optional)" className={inputCls + " !w-44 !py-1.5 text-sm"} />
        <Btn type="submit" variant="outline">Upload</Btn>
        {error === "toobig" && <p className="w-full text-xs font-medium text-bad">That file is over the 8 MB limit.</p>}
        {error === "missing" && <p className="w-full text-xs font-medium text-bad">Choose a file first.</p>}
      </form>
    </Card>
  );
}
