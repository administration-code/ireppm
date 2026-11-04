"use client";

import { useId } from "react";

// Repair and replacement estimates (before HST) when logging a maintenance request.
export default function CostEstimateFields({ repair, replace, onRepair, onReplace }) {
  const id = useId();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${id}-rep`}>Repair cost estimate, before HST (optional)</label>
          <input id={`${id}-rep`} inputMode="decimal" value={repair} onChange={(e) => onRepair(e.target.value)} placeholder="180" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-new`}>Replacement cost, if replacing is an option</label>
          <input id={`${id}-new`} inputMode="decimal" value={replace} onChange={(e) => onReplace(e.target.value)} placeholder="950" />
        </div>
      </div>
      <span className="small">
        HST is added on top. The landlord sees these. Anything over $250 with HST waits for the landlord&apos;s OK, unless it&apos;s an
        emergency.
      </span>
    </div>
  );
}
