"use client";

// Lightweight kanban: native HTML5 drag & drop, server action on drop.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setOpportunityStage } from "@/app/actions";
import { fmtDate } from "@/lib/dates";

export type KanbanCard = {
  id: number;
  name: string;
  accountName: string | null;
  accountId: number | null;
  expectedEventDate: string | null;
  nextFollowUpAt: string | null;
  stage: string;
  overdue: boolean;
};

export default function KanbanBoard({ stages, cards }: {
  stages: string[];
  cards: KanbanCard[];
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<number, string>>({});
  const [, startTransition] = useTransition();

  const stageOf = (c: KanbanCard) => optimistic[c.id] ?? c.stage;

  const drop = (stage: string) => {
    if (dragId === null) return;
    const card = cards.find((c) => c.id === dragId);
    setOver(null);
    setDragId(null);
    if (!card || stageOf(card) === stage) return;
    setOptimistic((o) => ({ ...o, [card.id]: stage }));
    const fd = new FormData();
    fd.set("id", String(card.id));
    fd.set("stage", stage);
    fd.set("returnTo", "/pipeline");
    startTransition(async () => {
      await setOpportunityStage(fd);
      router.refresh();
    });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const inStage = cards.filter((c) => stageOf(c) === stage);
        return (
          <div key={stage}
            onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
            onDragLeave={() => setOver((o) => (o === stage ? null : o))}
            onDrop={() => drop(stage)}
            className={`flex w-[240px] shrink-0 flex-col rounded-card p-2 transition-colors ${
              over === stage ? "bg-accent-soft" : "bg-well"}`}>
            <Link href={`/opportunities?stage=${encodeURIComponent(stage)}`}
              className="group mb-2 flex items-baseline justify-between px-2 pt-1">
              <span className="text-[0.72rem] font-semibold uppercase tracking-wider text-soft group-hover:text-accent-deep">
                {stage}
              </span>
              <span className="text-[0.72rem] font-medium text-faint group-hover:text-accent-deep">
                {inStage.length}
              </span>
            </Link>
            <div className="flex min-h-[60px] flex-col gap-2">
              {inStage.map((c) => (
                <div key={c.id} draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                  className={`cursor-grab rounded-xl bg-card p-3 shadow-card transition-all hover:shadow-lift active:cursor-grabbing ${
                    dragId === c.id ? "opacity-50" : ""}`}>
                  <Link href={`/opportunities/${c.id}`} className="block">
                    <p className="text-[0.83rem] font-medium leading-snug hover:text-accent-deep">{c.name}</p>
                  </Link>
                  {c.accountName && (
                    <Link href={`/accounts/${c.accountId}`} className="mt-0.5 block text-xs text-soft hover:text-accent-deep">
                      {c.accountName}
                    </Link>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[0.7rem]">
                    <span className="text-faint">{c.expectedEventDate ? `Event ${fmtDate(c.expectedEventDate)}` : ""}</span>
                    {c.nextFollowUpAt && (
                      <span className={c.overdue ? "font-medium text-bad" : "text-faint"}>
                        ↻ {fmtDate(c.nextFollowUpAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
