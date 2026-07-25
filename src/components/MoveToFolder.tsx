"use client";

// A file's folder picker. Submits the moment you pick, so filing a document is
// one gesture instead of select-then-confirm.
import { useRef } from "react";
import { moveDocument } from "@/app/actions";

export default function MoveToFolder({ docId, folderId, folders, returnTo }: {
  docId: number;
  folderId: number | null;
  folders: { id: number; name: string }[];
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={moveDocument} className="shrink-0">
      <input type="hidden" name="id" value={docId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <select
        name="folderId"
        defaultValue={folderId ?? ""}
        aria-label="Move to folder"
        title="Move to folder"
        onChange={() => formRef.current?.requestSubmit()}
        className="max-w-[8.5rem] truncate rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-soft outline-none transition-colors hover:bg-hairline focus:border-accent"
      >
        <option value="">Unfiled</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </form>
  );
}
