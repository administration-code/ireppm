"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { loadReport } from "@/lib/inspection-reports";
import InspectionLetter, { normalizeStaffReport } from "@/components/InspectionLetter";

// Staff: an inspection report laid out as a letter, to print or save as a PDF for the landlord.
export default function InspectionReportPrint({ id }) {
  const [r, setR] = useState(undefined);
  const [opts, setOpts] = useState({ decisions: true, prices: false, inspector: false });

  useEffect(() => {
    loadReport(getBrowserClient(), id).then((data) => setR(data));
  }, [id]);

  if (r === undefined) return <p className="small">Loading…</p>;
  if (!r) return <div className="warnbox">Report not found.</div>;

  const toggle = (k) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const anyPrice = r.items.some((i) => i.price != null && i.decision !== "declined");

  function print() {
    const old = document.title;
    document.title = `${r.property?.address || "Property"} - Inspection Report ${r.inspected_on}`;
    window.print();
    setTimeout(() => {
      document.title = old;
    }, 1000);
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="no-print stack" style={{ gap: 10 }}>
        <Link className="back" href={`/admin/inspection-reports/${r.id}`}>
          ← Back to the report
        </Link>
        <div className="req-actions" style={{ flexWrap: "wrap" }}>
          <label className="check-line">
            <input type="checkbox" checked={opts.decisions} onChange={() => toggle("decisions")} />
            Show the landlord&apos;s approve/decline decisions
          </label>
          {anyPrice ? (
            <label className="check-line">
              <input type="checkbox" checked={opts.prices} onChange={() => toggle("prices")} />
              Show prices
            </label>
          ) : null}
          <label className="check-line">
            <input type="checkbox" checked={opts.inspector} onChange={() => toggle("inspector")} />
            Show who inspected
          </label>
          <button type="button" className="btn primary sm" onClick={print}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      <InspectionLetter report={normalizeStaffReport(r)} opts={opts} />
    </div>
  );
}
