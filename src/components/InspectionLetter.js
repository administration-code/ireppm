"use client";

import { longDate, money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { IRepMark } from "@/components/Brand";
import { APPLIANCES, CONDITION, DECISION, GUTTER, yesNo } from "@/lib/inspection-reports";

const unitName = (label) => (label && label !== "Whole property" ? label : "Whole property");

// An inspection report laid out as a letter on IRep letterhead (printed or saved as a PDF).
// report (normalized): { address, ownerName, inspected_on, inspected_by, checks, units: [{ id, label, stove, fridge, washer,
// dryer, notes }], items: [{ id, description, details, where, decision, owner_note, price }], notes }
// opts: { decisions, prices, inspector }
export function normalizeStaffReport(r) {
  return {
    address: [r.property?.address, r.property?.city].filter(Boolean).join(", "),
    ownerName: r.property?.owner?.name || "",
    inspected_on: r.inspected_on,
    inspected_by: r.inspected_by,
    checks: r,
    units: r.units.map((u) => ({ ...u, label: u.unit?.label })),
    items: r.items.map((i) => ({ ...i, where: i.unit?.label })),
    notes: r.notes,
  };
}

export function normalizeOwnerReport(r) {
  return {
    address: [r.property?.address, r.property?.city].filter(Boolean).join(", "),
    ownerName: "",
    inspected_on: r.inspected_on,
    inspected_by: "",
    checks: r.checks,
    units: r.units.map((u, n) => ({ ...u, id: u.id || n })),
    items: r.items.map((i) => ({ ...i, where: i.unit, price: i.decision === "approved" ? i.price : null })),
    notes: r.notes,
  };
}

export default function InspectionLetter({ report: r, opts = {} }) {
  const anyPrice = r.items.some((i) => i.price != null && i.decision !== "declined");
  const c = r.checks || {};
  return (
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
          <b>{r.address}</b>
        </p>
        {r.ownerName ? <p>Prepared for {r.ownerName}</p> : null}
        <p>Inspected {longDate(`${r.inspected_on}T12:00:00`)}</p>
        {opts.inspector && r.inspected_by ? <p>By {r.inspected_by}</p> : null}
      </div>
      <h1 className="receipt-title">Property Inspection Report</h1>

      <section className="letter-section">
        <h3 className="letter-h3">Property Checks</h3>
        <dl className="letter-summary">
          <div>
            <dt>Furnace filter swapped</dt>
            <dd>{yesNo(c.furnace_filter_swapped)}</dd>
          </div>
          <div>
            <dt>Water shut-off valve set for the season</dt>
            <dd>{yesNo(c.water_valve_set)}</dd>
          </div>
          <div>
            <dt>Gutters</dt>
            <dd>{GUTTER[c.gutter_condition] || "Not checked"}</dd>
          </div>
          <div>
            <dt>Signs of pests</dt>
            <dd>
              {yesNo(c.pests)}
              {c.pests && c.pests_note ? `: ${c.pests_note}` : ""}
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
                  <td>{u.label || "Main unit"}</td>
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
                  <td>{unitName(i.where)}</td>
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
  );
}
