"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { cents, monthLabel, thisMonth } from "@/lib/rent";
import { addMoney, signedMoney, sumBy, toPayLabel } from "@/lib/payouts";
import { RentHead } from "./RentNav";

async function loadPayouts(month) {
  const sb = getBrowserClient();
  const period = `${month}-01`;
  const gen = await sb.rpc("generate_rent_charges", { p_month: period });
  const [totals, properties] = await Promise.all([
    sb.from("owner_statement_totals").select("*").eq("period", period),
    sb.from("properties").select("id, address, city, owner:owners(id, name)"),
  ]);
  const byId = new Map((properties.data || []).map((p) => [p.id, p]));
  const rows = (totals.data || [])
    .map((t) => ({ ...t, property: byId.get(t.property_id) }))
    .sort((a, b) => String(a.property?.address).localeCompare(String(b.property?.address)));
  const failed = gen.error || totals.error || properties.error;
  return { rows, error: failed ? "Some figures couldn't load. Refresh the page to try again." : "" };
}

function rentBadge(row) {
  if (row.full_by_7th) return <span className="pill cs-full">Full by the 7th</span>;
  if (cents(row.rent_expected) <= 0) return <span className="pill opt">No rent due</span>;
  return <span className="pill cs-partial">Waiting on rent</span>;
}

function FeeCell({ row }) {
  if (row.fee_billed_separately) return <span className="small">Paid separately</span>;
  return <span className="num">{signedMoney(-addMoney(row.mgmt_fee, row.mgmt_fee_hst))}</span>;
}

function ToPay({ value }) {
  const { text, cls } = toPayLabel(value);
  return <span className={`num ${cls}`}>{text}</span>;
}

export default function PayoutsBoard({ initialMonth }) {
  const [month, setMonth] = useState(() => initialMonth || thisMonth());
  const [onlyToSend, setOnlyToSend] = useState(false);
  const [state, setState] = useState({ loading: true, rows: [], error: "" });

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadPayouts(month).then(
      (data) => alive && setState({ loading: false, ...data }),
      () => alive && setState({ loading: false, rows: [], error: "We couldn't load payouts. Refresh the page to try again." })
    );
    return () => {
      alive = false;
    };
  }, [month]);

  const { loading, rows, error } = state;
  const shown = useMemo(() => (onlyToSend ? rows.filter((r) => cents(r.to_pay) > 0) : rows), [rows, onlyToSend]);

  const totals = useMemo(
    () => ({
      expected: sumBy(shown, "rent_expected"),
      collected: sumBy(shown, "rent_collected"),
      lmr: sumBy(shown, "last_month_forwarded"),
      fee: -addMoney(
        ...shown.filter((r) => !r.fee_billed_separately).flatMap((r) => [r.mgmt_fee, r.mgmt_fee_hst])
      ),
      workOrders: -sumBy(shown, "work_orders"),
      items: sumBy(shown, "items_total"),
      net: sumBy(shown, "net_due"),
      paidOut: sumBy(shown, "paid_out"),
      toPay: sumBy(shown, "to_pay"),
    }),
    [shown]
  );

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead
        title="Landlord Payouts"
        intro="What each owner is owed for the month after fees, work orders and statement items, and what's been sent."
      >
        <Link className="btn ghost sm" href="/admin/rent">
          Rent Collection
        </Link>
      </RentHead>

      <div className="filters">
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label htmlFor="payout-month">Month</label>
          <input id="payout-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <label className="check" style={{ flex: "1 1 240px", alignSelf: "center" }}>
          <input type="checkbox" checked={onlyToSend} onChange={(e) => setOnlyToSend(e.target.checked)} />
          Only properties with money to send
        </label>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      <div className="rent-stats" aria-live="polite">
        {[
          ["Collected", money(totals.collected)],
          ["Net due to owners", money(totals.net)],
          ["Paid out", money(totals.paidOut)],
          ["Left to pay", toPayLabel(totals.toPay).text],
        ].map(([label, value]) => (
          <div key={label} className="stat">
            <span className="stat-label">{label}</span>
            <span className={`stat-value num${label === "Left to pay" && cents(totals.toPay) > 0 ? " is-late" : ""}`}>
              {loading ? "…" : value}
            </span>
          </div>
        ))}
      </div>

      <section className="boxed stack" aria-labelledby="sec-payouts">
        <h2 id="sec-payouts" className="sec-title">
          {monthLabel(`${month}-01`)} statements
        </h2>
        {loading ? (
          <p className="small">Loading statements…</p>
        ) : !shown.length ? (
          <p className="small">
            {onlyToSend && rows.length ? "Every owner is paid up for this month." : "No statements for this month yet."}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table rent-table payouts-table">
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  <th scope="col">Owner</th>
                  <th scope="col" className="r">Expected</th>
                  <th scope="col" className="r">Collected</th>
                  <th scope="col">Rent</th>
                  <th scope="col" className="r">Last month&apos;s rent</th>
                  <th scope="col" className="r">Mgmt fee + HST</th>
                  <th scope="col" className="r">Work orders</th>
                  <th scope="col" className="r">Fees, expenses &amp; adjustments</th>
                  <th scope="col" className="r">Net due</th>
                  <th scope="col" className="r">Paid out</th>
                  <th scope="col" className="r">To pay</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.property_id}>
                    <td className="addr">
                      <Link href={`/admin/payouts/${r.property_id}/${month}`}>
                        {r.property?.address || "Unknown property"}
                      </Link>
                    </td>
                    <td>{r.property?.owner?.name || "—"}</td>
                    <td className="r num">{money(r.rent_expected)}</td>
                    <td className="r num">{money(r.rent_collected)}</td>
                    <td>{rentBadge(r)}</td>
                    <td className="r num">{money(r.last_month_forwarded)}</td>
                    <td className="r">
                      <FeeCell row={r} />
                    </td>
                    <td className="r num">{signedMoney(-Number(r.work_orders || 0))}</td>
                    <td className="r num">{signedMoney(r.items_total)}</td>
                    <td className="r num">{money(r.net_due)}</td>
                    <td className="r num">{money(r.paid_out)}</td>
                    <td className="r">
                      <ToPay value={r.to_pay} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <th scope="row" colSpan={2}>
                    Total ({shown.length} {shown.length === 1 ? "property" : "properties"})
                  </th>
                  <td className="r num">{money(totals.expected)}</td>
                  <td className="r num">{money(totals.collected)}</td>
                  <td />
                  <td className="r num">{money(totals.lmr)}</td>
                  <td className="r num">{signedMoney(totals.fee)}</td>
                  <td className="r num">{signedMoney(totals.workOrders)}</td>
                  <td className="r num">{signedMoney(totals.items)}</td>
                  <td className="r num">{money(totals.net)}</td>
                  <td className="r num">{money(totals.paidOut)}</td>
                  <td className="r">
                    <ToPay value={totals.toPay} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
