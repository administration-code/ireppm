"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { monthLabel, shortDate } from "@/lib/rent";
import AccountingTabs from "./AccountingTabs";

const yearStart = () => `${new Date().getFullYear()}-01-01`;

// Staff: the tracker's Deposits & Leasing tab, per tenancy. LMR expected and received, the statement
// it was forwarded on (or held), key deposit, the leasing fee, its HST and Chuck's and Rishi's shares.
export default function DepositsLeasing() {
  const [rows, setRows] = useState(null);
  const [from, setFrom] = useState(yearStart());
  const [find, setFind] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("deposits_leasing")
      .select("*")
      .gte("start_date", from)
      .order("start_date", { ascending: false })
      .then(({ data }) => alive && setRows(data || []));
    return () => {
      alive = false;
    };
  }, [from]);

  const q = find.trim().toLowerCase();
  const list = (rows || []).filter((r) => !q || [r.address, r.unit, r.tenants].join(" ").toLowerCase().includes(q));
  const totals = useMemo(
    () =>
      list.reduce(
        (t, r) => ({
          lmr: t.lmr + Number(r.lmr_received),
          held: t.held + Number(r.held_now) + Number(r.lmr_held_opening) + Number(r.unforwarded_opening),
          fee: t.fee + Number(r.leasing_fee),
          hst: t.hst + Number(r.leasing_hst),
          chuck: t.chuck + Number(r.chuck_share),
          rishi: t.rishi + Number(r.rishi_share),
        }),
        { lmr: 0, held: 0, fee: 0, hst: 0, chuck: 0, rishi: 0 }
      ),
    [list]
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <AccountingTabs
        title="Deposits & Leasing"
        subtitle="Each new tenancy: last month's rent (LMR) received and whether it went to the landlord or is held, key deposit, and the leasing fee split."
      />
      <div className="row3">
        <div className="field">
          <label htmlFor="dl-from">Tenancies starting from</label>
          <input id="dl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="dl-find">Search</label>
          <input id="dl-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Address, unit or tenant" />
        </div>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !list.length ? (
        <p className="small">No tenancies starting in this range.</p>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            LMR received {money(totals.lmr)} · Held by IRep {money(totals.held)} · Leasing fees {money(totals.fee)} + HST {money(totals.hst)} ·
            Chuck {money(totals.chuck)} · Rishi {money(totals.rishi)}
          </p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Tenancy</th>
                  <th scope="col">Starts</th>
                  <th scope="col" className="r">Rent</th>
                  <th scope="col" className="r">LMR</th>
                  <th scope="col">LMR went to</th>
                  <th scope="col" className="r">Key</th>
                  <th scope="col" className="r">Leasing fee</th>
                  <th scope="col" className="r">HST</th>
                  <th scope="col" className="r">Chuck 50%</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const held = Number(r.held_now) + Number(r.lmr_held_opening) + Number(r.unforwarded_opening);
                  const lmrShort = Number(r.lmr_expected || 0) - Number(r.lmr_received);
                  return (
                    <tr key={r.tenancy_id}>
                      <td>
                        <Link href={`/admin/properties/${r.property_id}`}>{[r.address, r.unit].filter(Boolean).join(", ")}</Link>
                        <span className="sub-line small">{r.tenants || "No tenants"}</span>
                      </td>
                      <td>{shortDate(r.start_date)}</td>
                      <td className="r num">{r.collects_rent === false ? "Not collected" : money(r.rent)}</td>
                      <td className="r num">
                        {money(r.lmr_received)}
                        {lmrShort > 0.004 ? <span className="sub-line small">{money(lmrShort)} still to come</span> : null}
                      </td>
                      <td>
                        {held > 0.004
                          ? `Held by IRep (${money(held)})`
                          : Number(r.lmr_received) > 0 && r.lmr_statement_month
                            ? `Landlord, ${monthLabel(r.lmr_statement_month)} statement`
                            : "—"}
                      </td>
                      <td className="r num">
                        {r.key_expected || Number(r.key_received) ? `${money(r.key_received)}${r.key_expected ? ` of ${money(r.key_expected)}` : ""}` : "—"}
                      </td>
                      <td className="r num">{Number(r.leasing_fee) ? money(r.leasing_fee) : "—"}</td>
                      <td className="r num">{Number(r.leasing_hst) ? money(r.leasing_hst) : "—"}</td>
                      <td className="r num">{Number(r.chuck_share) ? money(r.chuck_share) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small" style={{ margin: 0 }}>
            LMR is forwarded on the landlord&apos;s statement for the month it&apos;s received, unless a rent hold keeps it with IRep. Chuck&apos;s
            share is half of each leasing fee (before HST); it&apos;s paid out under Commissions &amp; Loans.
          </p>
        </>
      )}
    </div>
  );
}
