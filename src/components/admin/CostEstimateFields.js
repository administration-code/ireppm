"use client";

import { useId } from "react";
import { SITE } from "@/lib/site";
import { withHst } from "@/lib/maintenance";

const valid = (v) => /^\d+(\.\d{1,2})?$/.test(String(v ?? "").trim()) && Number(v) > 0;
const fmt = (n) => `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Total({ value }) {
  if (!valid(value)) return null;
  return (
    <span className="small">
      {fmt(value)} + HST = <b>{fmt(withHst(value))}</b>
    </span>
  );
}

// Repair and replacement estimates (before HST) when logging a maintenance request.
export default function CostEstimateFields({ repair, replace, onRepair, onReplace, urgency }) {
  const id = useId();
  const limit = SITE.approvalThreshold;
  const main = valid(repair) ? Number(repair) : valid(replace) ? Number(replace) : null;
  const needsOk = main != null && main > limit && urgency !== "emergency";
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${id}-rep`}>Repair cost estimate, before HST (optional)</label>
          <input id={`${id}-rep`} inputMode="decimal" value={repair} onChange={(e) => onRepair(e.target.value)} placeholder="180" />
          <Total value={repair} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-new`}>Replacement cost, if replacing is an option</label>
          <input id={`${id}-new`} inputMode="decimal" value={replace} onChange={(e) => onReplace(e.target.value)} placeholder="950" />
          <Total value={replace} />
        </div>
      </div>
      <span className="small">
        {main == null
          ? `The landlord sees these. Up to $${limit} before HST is approved automatically; more than that waits for the landlord's OK, unless it's an emergency.`
          : needsOk
            ? `Over $${limit} before HST: this will wait for the landlord's OK.`
            : urgency === "emergency" && main > limit
              ? "Emergency: goes ahead right away, and the landlord is told."
              : `$${limit} or less before HST: approved automatically.`}
      </span>
    </div>
  );
}
