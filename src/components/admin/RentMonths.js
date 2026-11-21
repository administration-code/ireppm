"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel } from "@/lib/rent";

// How the tenancy's payments are applied: oldest unpaid month first. A credit sits on the
// latest month and is used up by the next charge.
export default function RentMonths({ tenancyId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("rent_collection")
      .select("period, due, paid, outstanding")
      .eq("tenancy_id", tenancyId)
      .order("period", { ascending: false })
      .limit(24)
      .then(({ data }) => alive && setRows(data || []));
    return () => {
      alive = false;
    };
  }, [tenancyId]);
  if (!rows?.length) return null;
  return (
    <details className="boxed stack">
      <summary>
        <b>How Payments Are Applied</b> <span className="small">(oldest unpaid month first)</span>
      </summary>
      <div className="table-scroll" style={{ marginTop: 10 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="r">Rent due</th>
              <th scope="col" className="r">Applied</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const out = Number(r.outstanding);
              return (
                <tr key={r.period}>
                  <td>{monthLabel(r.period)}</td>
                  <td className="r num">{money(r.due)}</td>
                  <td className="r num">{money(r.paid)}</td>
                  <td>
                    {out > 0.004
                      ? Number(r.paid) > 0
                        ? `Part paid, ${money(out)} owing`
                        : `Unpaid, ${money(out)} owing`
                      : out < -0.004
                        ? `Paid, ${money(-out)} credit carried forward`
                        : "Paid"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ margin: 0 }}>
        Every payment (e-Transfer, PayProp, cash or entered by hand) goes to the oldest month with rent owing. Anything extra is a credit that
        the next month&apos;s rent uses first.
      </p>
    </details>
  );
}
