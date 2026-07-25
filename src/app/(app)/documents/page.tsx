import Link from "next/link";
import { db, schema as s } from "@/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Btn, inputCls, RecordLink, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { uploadDocument, deleteDocument, createFolder, renameFolder, deleteFolder } from "@/app/actions";
import MoveToFolder from "@/components/MoveToFolder";
import { fmtBytes } from "@/components/DocumentsCard";
import { fmtDate } from "@/lib/dates";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const docerror = spStr(sp, "docerror");

  // ?folder=<id> shows one folder, ?folder=none shows unfiled, absent = all.
  const folderParam = spStr(sp, "folder");
  const folderId = folderParam && folderParam !== "none" ? Number(folderParam) : null;
  const unfiledOnly = folderParam === "none";

  const [folders, allDocs] = await Promise.all([
    db
      .select({
        id: s.documentFolders.id,
        name: s.documentFolders.name,
        // Outer column is written out in full: interpolating ${s.documentFolders.id}
        // renders a bare "id", which SQLite would resolve against `documents`.
        count: sql<number>`(select count(*) from documents where documents.folder_id = document_folders.id)`,
      })
      .from(s.documentFolders)
      .orderBy(asc(sql`lower(${s.documentFolders.name})`)),
    db
      .select({
        id: s.documents.id, name: s.documents.name, fileName: s.documents.fileName,
        mimeType: s.documents.mimeType, size: s.documents.size, createdAt: s.documents.createdAt,
        folderId: s.documents.folderId,
        projectId: s.documents.projectId, projectName: s.projects.name,
        campaignId: s.documents.campaignId, campaignName: s.campaigns.name,
        accountId: s.documents.accountId, accountName: s.accounts.name,
      })
      .from(s.documents)
      .leftJoin(s.projects, eq(s.documents.projectId, s.projects.id))
      .leftJoin(s.campaigns, eq(s.documents.campaignId, s.campaigns.id))
      .leftJoin(s.accounts, eq(s.documents.accountId, s.accounts.id))
      .orderBy(desc(s.documents.createdAt)),
  ]);

  const docs = allDocs.filter((d) =>
    folderId ? d.folderId === folderId : unfiledOnly ? d.folderId === null : true,
  );
  const current = folders.find((f) => f.id === folderId);
  const unfiledCount = allDocs.filter((d) => d.folderId === null).length;
  // Uploads and moves return to the folder you're standing in.
  const returnTo = `/documents${folderParam ? `?folder=${folderParam}` : ""}`;

  const typeDot = (mime: string) =>
    mime.includes("pdf") ? "bg-bad"
    : mime.startsWith("image/") ? "bg-info"
    : mime.includes("sheet") || mime.includes("csv") || mime.includes("excel") ? "bg-good"
    : "bg-faint";

  const tab = (href: string, label: string, count: number, active: boolean) => (
    <Link key={href} href={href}
      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
        active ? "bg-hairline font-medium text-ink" : "text-soft hover:bg-hairline hover:text-ink-hover"
      }`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-xs text-faint">{count}</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Documents"
        subtitle="Flyers, one-pagers, contracts, credentialing paperwork — file them in folders, attach them to projects and campaigns, or keep them here" />

      {/* min-w-0 on both columns: grid children default to min-width:auto and
          would otherwise be forced wide by the upload row's intrinsic width. */}
      <div className="grid gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Folders */}
        <Card className="h-fit min-w-0">
          <CardHeader title="Folders" />
          <nav className="flex flex-col gap-0.5 px-2">
            {tab("/documents", "All files", allDocs.length, !folderParam)}
            {folders.map((f) => tab(`/documents?folder=${f.id}`, f.name, Number(f.count), folderId === f.id))}
            {tab("/documents?folder=none", "Unfiled", unfiledCount, unfiledOnly)}
          </nav>
          <form action={createFolder} className="mt-2 flex items-end gap-2 border-t border-hairline px-4 py-3.5">
            <input name="name" required placeholder="New folder" className={inputCls + " !py-1.5 text-sm"} />
            <Btn type="submit" variant="outline">Add</Btn>
          </form>
        </Card>

        <div className="min-w-0">
          {/* Upload — lands in the folder you're viewing */}
          <Card className="mb-5">
            <form action={uploadDocument} className="flex flex-wrap items-center gap-2 px-5 py-4">
              <input type="hidden" name="returnTo" value={returnTo} />
              {folderId && <input type="hidden" name="folderId" value={folderId} />}
              <input type="file" name="file" required
                className="min-w-0 flex-1 text-sm text-soft file:mr-3 file:rounded-full file:border-0 file:bg-hairline file:px-3.5 file:py-1.5 file:text-[0.8rem] file:font-medium file:text-ink hover:file:bg-line" />
              <input name="name" placeholder="Name (optional)" className={inputCls + " !w-full !py-1.5 text-sm sm:!w-44"} />
              <Btn type="submit">Upload{current ? ` to ${current.name}` : ""}</Btn>
              {docerror === "toobig" && <p className="w-full text-xs font-medium text-bad">That file is over the 8 MB limit.</p>}
              {docerror === "missing" && <p className="w-full text-xs font-medium text-bad">Choose a file first.</p>}
            </form>
          </Card>

          <Card>
            <CardHeader
              title={`${current?.name ?? (unfiledOnly ? "Unfiled" : "Library")} · ${docs.length} file${docs.length === 1 ? "" : "s"}`}
              action={<span className="hidden text-xs text-faint sm:inline">Up to 8 MB each</span>} />

            {/* Rename / delete apply to the folder you're inside */}
            {current && (
              <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
                <form action={renameFolder} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={current.id} />
                  <input name="name" defaultValue={current.name} aria-label="Folder name"
                    className={inputCls + " !w-44 !py-1.5 text-sm"} />
                  <Btn type="submit" variant="outline">Rename</Btn>
                </form>
                <form action={deleteFolder}>
                  <input type="hidden" name="id" value={current.id} />
                  <button type="submit"
                    className="rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium text-soft transition-colors hover:bg-bad-soft hover:text-bad">
                    Delete folder
                  </button>
                </form>
                <span className="text-xs text-faint">Deleting a folder keeps its files — they move to Unfiled.</span>
              </div>
            )}

            {docs.length === 0 ? (
              <EmptyState icon="folder" title={current ? `Nothing in ${current.name} yet` : "No documents yet"}
                hint="Upload flyers, ad materials, or paperwork — or add them straight from a project or campaign page." />
            ) : (
              <ul className="divide-y divide-hairline px-5">
                {docs.map((d) => (
                  // On phones the name takes the full line and the controls drop
                  // beneath it; from sm up it's a single row.
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <span className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-0">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${typeDot(d.mimeType)}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <a href={`/api/documents/${d.id}`} target="_blank" title={d.name}
                          className="block truncate text-sm font-medium transition-colors hover:text-accent-deep">
                          {d.name}
                        </a>
                        <span className="block truncate text-xs text-soft">
                          {fmtBytes(d.size)} · {fmtDate(d.createdAt)}
                          {d.projectId && <> · <RecordLink href={`/projects/${d.projectId}`} muted>{d.projectName}</RecordLink></>}
                          {d.campaignId && <> · <RecordLink href={`/campaigns/${d.campaignId}`} muted>{d.campaignName}</RecordLink></>}
                          {d.accountId && <> · <RecordLink href={`/accounts/${d.accountId}`} muted>{d.accountName}</RecordLink></>}
                          {!d.projectId && !d.campaignId && !d.accountId && <> · General</>}
                        </span>
                      </span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <MoveToFolder docId={d.id} folderId={d.folderId} folders={folders} returnTo={returnTo} />
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
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
