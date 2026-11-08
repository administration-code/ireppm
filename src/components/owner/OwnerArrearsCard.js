"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate } from "@/lib/rent";
import { NOTICE_STATUS } from "@/lib/notices";

// Landlord portal: who is behind on rent right now at their properties, and any N4s issued.
export default function OwnerArrearsCard() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .rpc("owner_arrears")
      .then(({ data, error }) => alive && setRows(error ? [] : Array.isArray(data) ? data : []));
    return () => {
      alive = false;
    };
  }, []);

  if (rows === null) return null;
  const owing = rows.filter((r) => Number(r.balance) > 0);
  const total = owing.reduce((sum, r) => sum + Number(r.balance), 0);

  return (
    <section className="boxed stack" aria-labelledby="oa-title">
      <h2 id="oa-title" className="sec-title">
        Rent Arrears
      </h2>
      {!rows.length ? (
        <p className="small" style={{ margin: 0 }}>
          Every tenant at your properties is paid up.
        </p>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            {owing.length
              ? `${owing.length} tenant${owing.length === 1 ? "" : "s"} behind, ${money(total)} owing in total. Updated as payments come in.`
              : "Nobody is behind right now."}
          </p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  <th scope="col">Tenants</th>
                  <th scope="col">Months owing</th>
                  <th scope="col" className="r">
                    Owing
                  </th>
                  <th scope="col">Last paid</th>
                  <th scope="col">N4</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.address}
                      {r.unit && r.unit !== "Whole property" ? <span className="small sub-line">{r.unit}</span> : null}
                    </td>
                    <td>
                      {(r.tenants || []).join(", ") || "—"}
                      {r.moved_out ? <span className="small sub-line">Moved out</span> : null}
                    </td>
                    <td className="small">
                      {(r.months || []).length
                        ? r.months.map((m) => `${monthLabel(m.period)} ${money(m.owing)}`).join(" · ")
                        : "—"}
                    </td>
                    <td className={`r num${Number(r.balance) > 0 ? " owing" : ""}`}>{money(r.balance)}</td>
                    <td className="small">{r.last_paid_on ? shortDate(r.last_paid_on) : "—"}</td>
                    <td className="small">
                      {(r.n4s || []).length
                        ? r.n4s.map((n, j) => (
                            <span key={j} className="sub-line">
                              Issued {shortDate(n.served_on)}
                              {n.amount != null ? ` for ${money(n.amount)}` : ""}
                              {n.effective_date ? `, termination date ${shortDate(n.effective_date)}` : ""}
                              {n.status && n.status !== "served" ? ` (${NOTICE_STATUS[n.status] || n.status})` : ""}
                            </span>
                          ))
                        : "None"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
