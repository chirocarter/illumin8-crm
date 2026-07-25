"use client";

// Stage select + loss reason that only appears when the stage is Lost / Not Fit.
import { useState } from "react";
import { Field, inputCls, selectCls } from "@/components/ui";
import { OPPORTUNITY_STAGES } from "@/lib/taxonomy";

export default function StageLossFields({ defaultStage, defaultLossReason }: {
  defaultStage: string;
  defaultLossReason: string;
}) {
  const [stage, setStage] = useState(defaultStage);
  const isLost = stage === "Lost / Not Fit";

  return (
    <>
      <Field label="Stage">
        <select name="stage" value={stage} onChange={(e) => setStage(e.target.value)} className={selectCls}>
          {OPPORTUNITY_STAGES.map((v) => <option key={v}>{v}</option>)}
        </select>
      </Field>
      {isLost && (
        <Field label="Why was it lost?">
          <input name="lossReason" defaultValue={defaultLossReason} className={inputCls}
            placeholder="e.g. Went with another provider, no budget…" />
        </Field>
      )}
    </>
  );
}
