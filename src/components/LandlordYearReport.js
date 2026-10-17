"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { dollars, downloadCsv, monthOnly, staffMessage } from "@/lib/accounting";
import { monthLabel, shortDate, todayISO } from "@/lib/rent";
import { SITE } from "@/lib/site";
import YearSelect from "@/components/YearSelect";
import EarlierEntries from "@/components/admin/accounting/EarlierEntries";

export const REPORT_COLUMNS = [
  ["rent", "Rent collected by IRep"],
  ["rent_direct", "Rent paid to you directly"],
  ["management_fee", "Management fee"],
  ["management_hst", "HST on management"],
  ["leasing_fee", "Leasing fee"],
  ["leasing_hst", "HST on leasing"],
  ["repairs", "Repairs"],
  ["other_expense", "Other expenses"],
];

const n = (v) => Number(v || 0);

export const netOf = (r) =>
  n(r.rent) +
  n(r.rent_direct) +
  n(r.other_income) -
  n(r.management_fee) -
  n(r.management_hst) -
  n(r.leasing_fee) -
  n(r.leasing_hst) -
  n(r.repairs) -
  n(r.other_expense);

function earlierRow(lines) {
  const row = {};
  for (const l of lines || []) row[l.category] = n(row[l.category]) + n(l.amount);
  return row;
}

function beforeLabel(first) {
  return first ? `Before ${monthLabel(first)}` : "Before the website";
}

function money2(v) {
  return n(v).toFixed(2);
}

function downloadReport(data) {
  const rows = [];
  for (const p of data.properties) {
    if (p.earlier_entries?.length) {
      const e = earlierRow(p.earlier_entries);
      rows.push([p.address, p.city || "", beforeLabel(data.first_month_in_system), ...REPORT_COLUMNS.map(([k]) => money2(e[k])), money2(netOf(e)), money2(e.paid_out)]);
    }
    for (const m of p.months) {
      rows.push([p.address, p.city || "", String(m.period).slice(0, 7), ...REPORT_COLUMNS.map(([k]) => money2(m[k])), money2(netOf(m)), money2(m.paid_out)]);
    }
  }
  const slug = String(data.owner?.name || "landlord").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  downloadCsv(
    `${slug}-${data.year}-rental-income.csv`,
    ["property", "city", "month", ...REPORT_COLUMNS.map(([k]) => k), "net", "paid_to_you"],
    rows
  );
}

function mailtoFor(data) {
  const name = data.owner?.name || "";
  const subject = `Your ${data.year} rental income summary`;
  const body = [
    `Hi ${name},`,
    "",
    `Attached is your ${data.year} rental income summary from IRep Property Management (PDF). It shows the rent and expenses for each of your properties and a summary for your T776.`,
    "",
    "Please pass it on to your accountant, and let us know if you have any questions.",
    "",
    "Thank you,",
    "IRep Property Management",
    SITE.phone,
  ].join("\n");
  return `mailto:${encodeURIComponent(data.owner?.email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function LandlordYearReport({ ownerId, year, staff = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data: d, error: err } = await getBrowserClient().rpc("landlord_year_report", { p_owner_id: ownerId, p_year: year });
    if (err) {
      setError(
        staff
          ? staffMessage(err, "We couldn't load this report. Refresh the page to try again.")
          : "We couldn't load your summary. Refresh the page to try again."
      );
      return;
    }
    setData(d);
  }, [ownerId, year, staff]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  return (
    <div className="stack">
      <div className="acct-strip no-print">
        <YearSelect year={year} />
        <div className="acct-inline-actions" style={{ marginLeft: "auto" }}>
          <button type="button" className="btn primary" onClick={() => window.print()} disabled={!data}>
            Print / Save PDF
          </button>
          {staff && data ? (
            <>
              <button type="button" className="btn ghost" onClick={() => downloadReport(data)}>
                Download CSV
              </button>
              {data.owner?.email ? (
                <a className="btn ghost" href={mailtoFor(data)}>
                  Email to landlord
                </a>
              ) : (
                <span className="small">No email on file for this landlord.</span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {!data && !error ? <p className="small">Loading…</p> : null}

      {data ? <Report data={data} /> : null}

      {staff && data ? <EarlierEntries properties={data.properties} year={year} onChange={load} /> : null}
    </div>
  );
}

function Report({ data }) {
  const before = beforeLabel(data.first_month_in_system);
  return (
    <article className="ly-report acct-print">
      <header className="ly-head">
        <p className="eyebrow">IRep Property Management</p>
        <h2 className="admin-title">Rental income summary {data.year}</h2>
        <p>
          <b>{data.owner?.name}</b>
        </p>
        <p className="small">
          Prepared by IRep Property Management · {shortDate(todayISO())}
        </p>
      </header>

      <section className="stack" style={{ gap: 8 }} aria-labelledby="ly-t776">
        <h3 id="ly-t776" className="sec-title">
          Summary for your T776
        </h3>
        <table className="acct-st ly-t776">
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Description</th>
              <th scope="col" className="num">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {(data.t776 || []).map((l) => (
              <tr key={l.line}>
                <td>{l.line}</td>
                <td>{l.label}</td>
                <td className="num">{dollars(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small">
          Line numbers are a guide to CRA form T776 (Statement of Real Estate Rentals). HST is included in the fee lines.
          If you&apos;re registered for HST, your accountant may claim it back instead. Please confirm with your accountant.
        </p>
        <p className="small">
          Expenses you paid yourself (mortgage interest, property tax, insurance, utilities you pay) aren&apos;t included.
        </p>
      </section>

      {data.properties.length === 0 ? <p className="small">No properties on file for this year.</p> : null}

      {data.properties.map((p) => (
        <PropertyTable key={p.property_id} p={p} before={before} />
      ))}
    </article>
  );
}

function PropertyTable({ p, before }) {
  const early = p.earlier_entries?.length ? earlierRow(p.earlier_entries) : null;
  const caption = [p.address, p.city].filter(Boolean).join(", ");
  return (
    <section className="stack ly-property" style={{ gap: 8 }}>
      <h3 className="sec-title">
        {caption}
        {p.units ? <span className="small"> · {p.units === 1 ? "1 unit" : `${p.units} units`}</span> : null}
      </h3>
      {p.fee_billed_separately ? (
        <p className="small">
          Management fees for this property were billed to you separately and aren&apos;t shown here.
        </p>
      ) : null}
      <div className="ly-table-wrap">
        <table className="acct-st ly-table">
          <caption className="sr-only">Monthly income and expenses for {caption}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              {REPORT_COLUMNS.map(([k, label]) => (
                <th key={k} scope="col" className="num">
                  {label}
                </th>
              ))}
              <th scope="col" className="num">
                Net
              </th>
              <th scope="col" className="num">
                Paid to you
              </th>
            </tr>
          </thead>
          <tbody>
            {early ? (
              <tr>
                <th scope="row">{before}</th>
                {REPORT_COLUMNS.map(([k]) => (
                  <td key={k} className="num">
                    {dollars(early[k])}
                  </td>
                ))}
                <td className="num">{dollars(netOf(early))}</td>
                <td className="num">{dollars(early.paid_out)}</td>
              </tr>
            ) : null}
            {p.months.map((m) => (
              <tr key={m.period}>
                <th scope="row">{monthOnly(m.period)}</th>
                {REPORT_COLUMNS.map(([k]) => (
                  <td key={k} className="num">
                    {dollars(m[k])}
                  </td>
                ))}
                <td className="num">{dollars(netOf(m))}</td>
                <td className="num">{dollars(m.paid_out)}</td>
              </tr>
            ))}
            {!early && p.months.length === 0 ? (
              <tr>
                <td colSpan={REPORT_COLUMNS.length + 3} className="small">
                  Nothing recorded for this year.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {REPORT_COLUMNS.map(([k]) => (
                <td key={k} className="num">
                  {dollars(p.totals?.[k])}
                </td>
              ))}
              <td className="num">{dollars(p.totals?.net_income ?? netOf(p.totals || {}))}</td>
              <td className="num">{dollars(p.totals?.paid_out)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {n(p.totals?.other_income) ? (
        <p className="small">Net includes {dollars(p.totals.other_income)} of other income.</p>
      ) : null}
    </section>
  );
}
