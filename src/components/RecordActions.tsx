// Reclassify / delete panel for record detail pages.
//
// Deleting is a two-step, URL-driven confirm (?confirm=delete) rather than a
// JS dialog: the second screen states exactly what will be detached and what
// will be removed, so nothing disappears unannounced.
import Link from "next/link";
import { Card, CardHeader, Btn } from "@/components/ui";
import {
  deleteRecord, deletionImpact,
  convertAccountToContact, convertContactToAccount,
  convertLeadToAccount, convertLeadToContact,
} from "@/app/actions";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

type Kind = "account" | "contact" | "lead" | "opportunity" | "event" | "campaign" | "partner" | "project";

const NOUN: Record<Kind, string> = {
  account: "business", contact: "contact", lead: "lead", opportunity: "opportunity",
  event: "event", campaign: "campaign", partner: "partner", project: "project",
};

export default async function RecordActions({ kind, id, name, sp, returnTo }: {
  kind: Kind;
  id: number;
  name: string;
  sp: SP;
  /** where to land after deleting — defaults to the list page */
  returnTo?: string;
}) {
  const confirming = spStr(sp, "confirm") === "delete";
  const impact = confirming ? await deletionImpact(kind, id) : { detach: [], remove: [] };
  const noun = NOUN[kind];
  const here = `/${kind === "account" ? "accounts" : kind === "opportunity" ? "opportunities" : kind + "s"}/${id}`;

  // Reclassification options, per record type.
  const conversions =
    kind === "account" ? [{ action: convertAccountToContact, label: "Convert to contact", hint: "This is a person, not a business" }]
    : kind === "contact" ? [{ action: convertContactToAccount, label: "Convert to business", hint: "This is a business, not a person" }]
    : kind === "lead" ? [
        { action: convertLeadToAccount, label: "Convert to business", hint: "This lead is actually a business" },
        { action: convertLeadToContact, label: "Promote to contact", hint: "Keeps the lead for attribution" },
      ]
    : [];

  return (
    <Card className="mt-5">
      <CardHeader title="Manage" action={
        <span className="hidden text-xs text-faint sm:inline">Reclassify or remove this {noun}</span>
      } />

      {conversions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          {conversions.map((c) => (
            <form key={c.label} action={c.action}>
              <input type="hidden" name="id" value={id} />
              <Btn type="submit" variant="outline" title={c.hint}>{c.label}</Btn>
            </form>
          ))}
          <span className="text-xs text-faint">Moves it — history follows the new record.</span>
        </div>
      )}

      <div className="border-t border-hairline px-5 py-4">
        {!confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`${here}?confirm=delete`}
              className="rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium text-soft transition-colors hover:bg-bad-soft hover:text-bad">
              Delete this {noun}
            </Link>
            <span className="text-xs text-faint">You&apos;ll see what it affects before anything happens.</span>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-bad">Delete “{name}”?</p>

            {impact.detach.length === 0 && impact.remove.length === 0 ? (
              <p className="mt-1 text-sm text-soft">Nothing else references it — this is a clean delete.</p>
            ) : (
              <div className="mt-2 space-y-1.5 text-sm text-soft">
                {impact.detach.length > 0 && (
                  <p>
                    <span className="font-medium text-ink">Kept, but unlinked:</span>{" "}
                    {impact.detach.map((d) => `${d.n} ${d.label}`).join(", ")} — these stay in the
                    system and only lose their link to this {noun}.
                  </p>
                )}
                {impact.remove.length > 0 && (
                  <p>
                    <span className="font-medium text-bad">Also deleted:</span>{" "}
                    {impact.remove.map((d) => `${d.n} ${d.label}`).join(", ")} — these cannot exist
                    without this {noun}.
                  </p>
                )}
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <form action={deleteRecord}>
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="id" value={id} />
                {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
                <button type="submit"
                  className="rounded-full bg-bad px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]">
                  Yes, delete
                </button>
              </form>
              <Link href={here}
                className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-hairline">
                Cancel
              </Link>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
