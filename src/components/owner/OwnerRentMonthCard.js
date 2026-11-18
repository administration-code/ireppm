"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate } from "@/lib/rent";

const cents = (v) => Math.round(Number(v || 0) * 100);
const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7);

function status(r) {
  if (cents(r.due) <= 0) return ["No rent due", ""];
  if (cents(r.paid_by_7th) >= cents(r.due)) return ["Paid by the 7th", "cs-full"];
  if (cents(r.outstanding) <= 0) return ["Paid", "cs-full"];
  if (cents(r.paid) > 0) return ["Partly paid", "cs-partial"];
  return ["Not yet", "cs-none"];
}

// Landlord portal: who has paid rent for a month (this month by default), tenant by tenant.
export default function OwnerRentMonthCard() {
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    getBrowserClient()
      .rpc("owner_rent_month", { p_period: `${month}-01` })
      .then(({ data, error }) => alive && setRows(error ? [] : Array.isArray(data) ? data : []));
    return () => {
      alive = false;
    };
  }, [month]);

  const list = rows || [];
  const paidCount = list.filter((r) => cents(r.due) > 0 && cents(r.outstanding) <= 0).length;
  const dueCount = list.filter((r) => cents(r.due) > 0).length;
  const collected = list.reduce((s, r) => s + Number(r.paid || 0), 0);
  const due = list.reduce((s, r) => s + Number(r.due || 0), 0);

  return (
    <section className="boxed stack" aria-labelledby="orm-title">
      <div className="admin-head" style={{ alignItems: "end" }}>
        <h2 id="orm-title" className="sec-title" style={{ margin: 0 }}>
          Rent This Month
        </h2>
        <div className="field" style={{ maxWidth: 200 }}>
          <label htmlFor="orm-month" className="visually-hidden">
            Month
          </label>
          <input id="orm-month" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !list.length ? (
        <p className="small" style={{ margin: 0 }}>
          No rent was due at your properties for {monthLabel(`${month}-01`)}.
        </p>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            {monthLabel(`${month}-01`)}: {paidCount} of {dueCount} paid in full · {money(collected)} received of {money(due)} due. Updated as
            payments come in.
          </p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  <th scope="col">Tenants</th>
                  <th scope="col" className="r">
                    Due
                  </th>
                  <th scope="col" className="r">
                    Paid
                  </th>
                  <th scope="col">Last paid</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const [label, cls] = status(r);
                  return (
                    <tr key={i}>
                      <td>
                        {r.address}
                        {r.unit && r.unit !== "Whole property" ? <span className="small sub-line">{r.unit}</span> : null}
                      </td>
                      <td>{(r.tenants || []).join(", ") || "—"}</td>
                      <td className="r num">{money(r.due)}</td>
                      <td className="r num">
                        {money(r.paid)}
                        {cents(r.outstanding) > 0 && cents(r.paid) > 0 ? <span className="small sub-line">{money(r.outstanding)} owing</span> : null}
                      </td>
                      <td className="small">{r.last_paid_on ? shortDate(r.last_paid_on) : "—"}</td>
                      <td>
                        <span className={`pill ${cls}`}>{label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
