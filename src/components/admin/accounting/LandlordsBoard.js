"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { defaultReportYear, dollars, staffMessage } from "@/lib/accounting";
import YearSelect from "@/components/YearSelect";
import { netOf } from "@/components/LandlordYearReport";
import AccountingTabs from "./AccountingTabs";

const COLS = [
  ["rent_all", "Rent"],
  ["management_fee", "Management fees"],
  ["management_hst", "Management HST"],
  ["leasing_fee", "Leasing fees"],
  ["leasing_hst", "Leasing HST"],
  ["repairs", "Repairs"],
  ["other_expense", "Other expenses"],
  ["net", "Net"],
  ["paid_out", "Paid out"],
];

const valueOf = (t, k) =>
  k === "rent_all" ? Number(t.rent || 0) + Number(t.rent_direct || 0) : k === "net" ? netOf(t) : Number(t[k] || 0);

export default function LandlordsBoard({ year: yearProp }) {
  const year = yearProp || defaultReportYear();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError("");
    getBrowserClient()
      .rpc("landlord_year_reports", { p_year: year })
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) setError(staffMessage(err, "We couldn't load the landlords. Refresh the page to try again."));
        else setRows(data || []);
      });
    return () => {
      alive = false;
    };
  }, [year]);

  return (
    <div className="stack">
      <AccountingTabs title="Landlord Year-End" subtitle="Each landlord's rental income summary for their T776.">
        <YearSelect year={year} />
      </AccountingTabs>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
      {!rows && !error ? <p className="small">Loading…</p> : null}

      {rows ? (
        <div className="ly-table-wrap boxed">
          <table className="acct-st">
            <thead>
              <tr>
                <th scope="col">Owner</th>
                {COLS.map(([k, label]) => (
                  <th key={k} scope="col" className="num">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.owner_id}>
                  <th scope="row">
                    <Link href={`/admin/accounting/landlords/${r.owner_id}?year=${year}`}>{r.owner}</Link>
                  </th>
                  {COLS.map(([k]) => (
                    <td key={k} className="num">
                      {dollars(valueOf(r.totals || {}, k))}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 1} className="small">
                    No landlords with properties yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length > 1 ? (
              <tfoot>
                <tr>
                  <th scope="row">All landlords</th>
                  {COLS.map(([k]) => (
                    <td key={k} className="num">
                      {dollars(rows.reduce((s, r) => s + valueOf(r.totals || {}, k), 0))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
    </div>
  );
}
