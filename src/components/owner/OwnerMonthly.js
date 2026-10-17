"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel } from "@/lib/rent";

const n = (v) => Number(v || 0);
const net = (m) =>
  n(m.rent) + n(m.rent_direct) + n(m.other_income) - n(m.management_fee) - n(m.management_hst) - n(m.leasing_fee) - n(m.leasing_hst) - n(m.repairs) - n(m.other_expense);

// Month-by-month rental summary for the landlord (same numbers as the annual report).
export default function OwnerMonthly() {
  const year = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 4));
  const [state, setState] = useState({ loading: true, data: null });
  const [period, setPeriod] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = getBrowserClient();
      const { data: ownerId } = await sb.rpc("my_owner_id");
      if (!ownerId) return alive && setState({ loading: false, data: null });
      const { data } = await sb.rpc("landlord_year_report", { p_owner_id: ownerId, p_year: year });
      if (alive) setState({ loading: false, data });
    })();
    return () => {
      alive = false;
    };
  }, [year]);

  const periods = useMemo(() => {
    const set = new Set();
    for (const p of state.data?.properties || []) for (const m of p.months || []) set.add(String(m.period).slice(0, 10));
    return [...set].sort().reverse();
  }, [state.data]);
  const current = period || periods[0] || "";

  if (state.loading) return <p className="small">Loading…</p>;
  if (!state.data || !periods.length) return <p className="small">Your first monthly summary will appear here once a month is recorded.</p>;

  const rows = (state.data.properties || [])
    .map((p) => ({ p, m: (p.months || []).find((x) => String(x.period).slice(0, 10) === current) }))
    .filter((r) => r.m);
  const tot = rows.reduce(
    (t, { m }) => ({
      rent: t.rent + n(m.rent) + n(m.rent_direct),
      fees: t.fees + n(m.management_fee) + n(m.management_hst) + n(m.leasing_fee) + n(m.leasing_hst),
      exp: t.exp + n(m.repairs) + n(m.other_expense),
      net: t.net + net(m),
      paid: t.paid + n(m.paid_out),
    }),
    { rent: 0, fees: 0, exp: 0, net: 0, paid: 0 }
  );

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="om-month">Month</label>
        <select id="om-month" value={current} onChange={(e) => setPeriod(e.target.value)}>
          {periods.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
            </option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col" className="r">Rent</th>
              <th scope="col" className="r">Fees + HST</th>
              <th scope="col" className="r">Repairs & other</th>
              <th scope="col" className="r">Net income</th>
              <th scope="col" className="r">Paid to you</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, m }) => (
              <tr key={p.property_id}>
                <td className="addr">{p.address}</td>
                <td className="r num">{money(n(m.rent) + n(m.rent_direct))}</td>
                <td className="r num">{money(n(m.management_fee) + n(m.management_hst) + n(m.leasing_fee) + n(m.leasing_hst))}</td>
                <td className="r num">{money(n(m.repairs) + n(m.other_expense))}</td>
                <td className="r num">{money(net(m))}</td>
                <td className="r num">{money(m.paid_out)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 ? (
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="r num">{money(tot.rent)}</td>
                <td className="r num">{money(tot.fees)}</td>
                <td className="r num">{money(tot.exp)}</td>
                <td className="r num">{money(tot.net)}</td>
                <td className="r num">{money(tot.paid)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="small">
        Months before we moved your records onto this website are included as one total in your{" "}
        <Link href={`/owner/year-end?year=${year}`}>annual summary</Link>.
      </p>
    </div>
  );
}
