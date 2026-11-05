"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { longDate, money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { IRepMark } from "@/components/Brand";
import { APPLIANCES, CONDITION, DECISION, GUTTER, loadReport, yesNo } from "@/lib/inspection-reports";

const unitName = (label) => (label && label !== "Whole property" ? label : "Whole property");

// Staff: an inspection report laid out as a letter, to print or save as a PDF for the landlord.
export default function InspectionReportPrint({ id }) {
  const [r, setR] = useState(undefined);
  const [opts, setOpts] = useState({ decisions: true, prices: false, inspector: false });

  useEffect(() => {
    loadReport(getBrowserClient(), id).then((data) => setR(data));
  }, [id]);

  if (r === undefined) return <p className="small">Loading…</p>;
  if (!r) return <div className="warnbox">Report not found.</div>;

  const address = [r.property?.address, r.property?.city].filter(Boolean).join(", ");
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

      <article className="receipt letter" aria-label="Inspection report">
        <header className="receipt-head">
          <div className="receipt-brand">
            <IRepMark />
            <span className="wm">
              <b>IREP</b>
              <i>PROPERTY MANAGEMENT</i>
            </span>
          </div>
          <address className="receipt-office">
            {SITE.name}
            <br />
            {SITE.address}
            <br />
            {SITE.phone}
            <br />
            {SITE.email}
          </address>
        </header>
        <div className="letter-meta">
          <p>
            <b>{address}</b>
          </p>
          {r.property?.owner?.name ? <p>Prepared for {r.property.owner.name}</p> : null}
          <p>Inspected {longDate(`${r.inspected_on}T12:00:00`)}</p>
          {opts.inspector && r.inspected_by ? <p>By {r.inspected_by}</p> : null}
        </div>
        <h1 className="receipt-title">Property Inspection Report</h1>

        <section className="letter-section">
          <h3 className="letter-h3">Property Checks</h3>
          <dl className="letter-summary">
            <div>
              <dt>Furnace filter swapped</dt>
              <dd>{yesNo(r.furnace_filter_swapped)}</dd>
            </div>
            <div>
              <dt>Water shut-off valve set for the season</dt>
              <dd>{yesNo(r.water_valve_set)}</dd>
            </div>
            <div>
              <dt>Gutters</dt>
              <dd>{GUTTER[r.gutter_condition] || "Not checked"}</dd>
            </div>
            <div>
              <dt>Signs of pests</dt>
              <dd>
                {yesNo(r.pests)}
                {r.pests && r.pests_note ? `: ${r.pests_note}` : ""}
              </dd>
            </div>
          </dl>
        </section>

        {r.units.length ? (
          <section className="letter-section">
            <h3 className="letter-h3">Appliances by Unit</h3>
            <table className="letter-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  {APPLIANCES.map(([k, l]) => (
                    <th key={k}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.units.map((u) => [
                  <tr key={u.id}>
                    <td>{u.unit?.label || "Main unit"}</td>
                    {APPLIANCES.map(([k]) => (
                      <td key={k}>{u[k] === "needs_replacement" ? <b>{CONDITION[u[k]]}</b> : CONDITION[u[k]] || "—"}</td>
                    ))}
                  </tr>,
                  u.notes ? (
                    <tr key={`${u.id}-n`} className="muted-row">
                      <td colSpan={APPLIANCES.length + 1}>Notes: {u.notes}</td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="letter-section">
          <h3 className="letter-h3">Recommended Improvements</h3>
          {r.items.length ? (
            <table className="letter-table">
              <thead>
                <tr>
                  <th>Improvement</th>
                  <th>Where</th>
                  {opts.decisions ? <th>Decision</th> : null}
                  {opts.prices && anyPrice ? <th className="r">Price (before HST)</th> : null}
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.description}
                      {i.details ? (
                        <>
                          <br />
                          <span style={{ color: "#555" }}>{i.details}</span>
                        </>
                      ) : null}
                      {opts.decisions && i.owner_note ? (
                        <>
                          <br />
                          <span style={{ color: "#555" }}>Landlord&apos;s note: {i.owner_note}</span>
                        </>
                      ) : null}
                    </td>
                    <td>{unitName(i.unit?.label)}</td>
                    {opts.decisions ? <td>{DECISION[i.decision]}</td> : null}
                    {opts.prices && anyPrice ? (
                      <td className="r num">{i.price != null && i.decision !== "declined" ? money(i.price) : "—"}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>None recommended.</p>
          )}
        </section>

        {r.notes ? (
          <section className="letter-section">
            <h3 className="letter-h3">Other Notes</h3>
            <p className="pre-line">{r.notes}</p>
          </section>
        ) : null}

        <p className="receipt-note">Questions? Call {SITE.phone} or email {SITE.email}.</p>
      </article>
    </div>
  );
}
