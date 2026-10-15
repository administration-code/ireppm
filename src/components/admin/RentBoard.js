"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import {
  METHOD_LABEL,
  RENT_TENANCY_SELECT,
  cents,
  countUnmatched,
  monthLabel,
  primaryTenant,
  shortDate,
  tenancyAddress,
  thisMonth,
  todayISO,
} from "@/lib/rent";
import RentNav, { RentHead } from "./RentNav";

async function loadBoard(month) {
  const sb = getBrowserClient();
  const period = `${month}-01`;
  const gen = await sb.rpc("generate_rent_charges", { p_month: period });
  const [collection, balances, tenancies, unmatched] = await Promise.all([
    sb.from("rent_collection").select("*").eq("period", period),
    sb.from("tenancy_balances").select("tenancy_id, charged, paid, balance, last_paid_on"),
    sb.from("tenancies").select(RENT_TENANCY_SELECT),
    countUnmatched(),
  ]);
  const failed = gen.error || collection.error || balances.error || tenancies.error;
  return {
    collection: collection.data || [],
    balances: balances.data || [],
    tenancies: tenancies.data || [],
    unmatched,
    error: failed ? "Some rent figures couldn't load. Refresh the page to try again." : "",
  };
}

function collectionStatus({ due, paid, by7 }) {
  if (cents(due) <= 0 || cents(by7) >= cents(due)) return ["Full by the 7th", "cs-full"];
  if (cents(paid) >= cents(due)) return ["Full, late", "cs-late"];
  if (cents(paid) > 0) return ["Partial", "cs-partial"];
  return ["Nothing yet", "cs-none"];
}

const sum = (list, key) => list.reduce((s, x) => s + cents(x[key]), 0) / 100;
const owing = (v) => Math.max(0, Number(v || 0));

export default function RentBoard() {
  const [month, setMonth] = useState(thisMonth);
  const [state, setState] = useState({ loading: true, collection: [], balances: [], tenancies: [], unmatched: 0, error: "" });
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadBoard(month).then(
      (data) => alive && setState({ loading: false, ...data }),
      () => alive && setState((s) => ({ ...s, loading: false, error: "We couldn't load rent. Refresh the page to try again." }))
    );
    return () => {
      alive = false;
    };
  }, [month]);

  const { loading, collection, balances, tenancies, unmatched, error } = state;
  const pastSeventh = todayISO() > `${month}-07`;

  const { groups, totals, arrears } = useMemo(() => {
    const byTenancy = new Map(tenancies.map((t) => [t.id, t]));
    const balanceOf = new Map(balances.map((b) => [b.tenancy_id, b]));
    const map = new Map();
    collection.forEach((c) => {
      const tenancy = byTenancy.get(c.tenancy_id);
      const property = tenancy?.unit?.property || { id: c.property_id, address: "Unknown property" };
      if (!map.has(property.id)) map.set(property.id, { property, items: [] });
      map.get(property.id).items.push({ c, tenancy, balance: balanceOf.get(c.tenancy_id) });
    });
    const list = [...map.values()]
      .map((g) => ({
        ...g,
        items: g.items.sort((a, b) => String(a.tenancy?.unit?.label).localeCompare(String(b.tenancy?.unit?.label))),
        due: sum(g.items.map((i) => i.c), "due"),
        paid: sum(g.items.map((i) => i.c), "paid"),
        by7: sum(g.items.map((i) => i.c), "paid_by_7th"),
        outstanding: g.items.reduce((s, i) => s + cents(owing(i.c.outstanding)), 0) / 100,
      }))
      .sort((a, b) => String(a.property.address).localeCompare(String(b.property.address)));

    return {
      groups: list,
      totals: {
        due: sum(collection, "due"),
        paid: sum(collection, "paid"),
        by7: sum(collection, "paid_by_7th"),
        outstanding: collection.reduce((s, c) => s + cents(owing(c.outstanding)), 0) / 100,
      },
      arrears: balances
        .filter((b) => cents(b.balance) > 0)
        .map((b) => ({ ...b, tenancy: byTenancy.get(b.tenancy_id) }))
        .sort((a, b) => Number(b.balance) - Number(a.balance)),
    };
  }, [collection, balances, tenancies]);

  const toggle = (id) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="stack" style={{ gap: 24 }}>
      <RentHead title="Rent" intro="Rent charged and collected each month, by property. Rent is on time if it's in by the 7th." />
      <RentNav current="/admin/rent" unmatched={unmatched} />

      <div className="filters">
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label htmlFor="rent-month">Month</label>
          <input id="rent-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <p className="small" style={{ flex: "1 1 240px", margin: 0 }}>
          Opening a month adds any missing rent charges for it.
        </p>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      <div className="rent-stats" aria-live="polite">
        {[
          ["Expected", totals.due],
          ["Collected", totals.paid],
          ["Collected by the 7th", totals.by7],
          ["Outstanding", totals.outstanding],
        ].map(([label, value]) => (
          <div key={label} className="stat">
            <span className="stat-label">{label}</span>
            <span className={`stat-value num${label === "Outstanding" && value > 0 && pastSeventh ? " is-late" : ""}`}>
              {loading ? "…" : money(value)}
            </span>
          </div>
        ))}
      </div>

      <section className="boxed stack" aria-labelledby="sec-collection">
        <h2 id="sec-collection" className="sec-title">
          {monthLabel(`${month}-01`)} by property
        </h2>
        {loading ? (
          <p className="small">Loading rent…</p>
        ) : !groups.length ? (
          <p className="small">No rent is charged for this month yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table rent-table">
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  <th scope="col" className="r">Expected</th>
                  <th scope="col" className="r">Collected</th>
                  <th scope="col" className="r">By the 7th</th>
                  <th scope="col" className="r">Outstanding</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const [label, cls] = collectionStatus(g);
                  const isOpen = open.has(g.property.id);
                  const late = pastSeventh && g.outstanding > 0;
                  return (
                    <Fragment key={g.property.id}>
                      <tr className={late ? "late-row" : undefined}>
                        <td className="addr">
                          <button
                            type="button"
                            className="expand-btn"
                            aria-expanded={isOpen}
                            aria-controls={`units-${g.property.id}`}
                            onClick={() => toggle(g.property.id)}
                          >
                            <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span> {g.property.address}
                            <span className="visually-hidden"> — show tenancies</span>
                          </button>
                        </td>
                        <td className="r num">{money(g.due)}</td>
                        <td className="r num">{money(g.paid)}</td>
                        <td className="r num">{money(g.by7)}</td>
                        <td className="r num">{money(g.outstanding)}</td>
                        <td>
                          <span className={`pill ${cls}`}>{label}</span>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr id={`units-${g.property.id}`} className="nested-row">
                          <td colSpan={6}>
                            <TenancyRows items={g.items} pastSeventh={pastSeventh} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="boxed stack" aria-labelledby="sec-arrears">
        <h2 id="sec-arrears" className="sec-title">
          Arrears
        </h2>
        <p className="small">Every tenancy that owes money across all months, largest first.</p>
        {loading ? (
          <p className="small">Loading…</p>
        ) : !arrears.length ? (
          <p className="small">Nobody is behind. Nice.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Tenant</th>
                  <th scope="col">Rental unit</th>
                  <th scope="col">Last paid</th>
                  <th scope="col" className="r">Balance owing</th>
                </tr>
              </thead>
              <tbody>
                {arrears.map((a) => (
                  <tr key={a.tenancy_id}>
                    <td className="addr">{a.tenancy ? primaryTenant(a.tenancy) : "Unknown tenancy"}</td>
                    <td>
                      {a.tenancy?.unit ? (
                        <Link href={`/admin/units/${a.tenancy.unit.id}`}>{tenancyAddress(a.tenancy)}</Link>
                      ) : (
                        "—"
                      )}
                      {a.tenancy?.status === "ended" ? <span className="small"> · moved out</span> : null}
                    </td>
                    <td>{shortDate(a.last_paid_on)}</td>
                    <td className="r num owing">{money(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TenancyRows({ items, pastSeventh }) {
  return (
    <div className="table-scroll">
      <table className="admin-table nested-table">
        <thead>
          <tr>
            <th scope="col">Unit</th>
            <th scope="col">Primary tenant</th>
            <th scope="col" className="r">Due</th>
            <th scope="col" className="r">Paid</th>
            <th scope="col" className="r">By the 7th</th>
            <th scope="col">Last paid</th>
            <th scope="col">Methods</th>
            <th scope="col" className="r">This month</th>
            <th scope="col" className="r">Total balance</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ c, tenancy, balance }) => {
            const out = owing(c.outstanding);
            return (
              <tr key={c.tenancy_id} className={pastSeventh && out > 0 ? "late-row" : undefined}>
                <td>
                  {tenancy?.unit ? <Link href={`/admin/units/${tenancy.unit.id}`}>{tenancy.unit.label}</Link> : "—"}
                </td>
                <td>{tenancy ? primaryTenant(tenancy) : "—"}</td>
                <td className="r num">{money(c.due)}</td>
                <td className="r num">{money(c.paid)}</td>
                <td className="r num">{money(c.paid_by_7th)}</td>
                <td>{shortDate(c.last_paid_on)}</td>
                <td>{(c.methods || []).map((m) => METHOD_LABEL[m] || m).join(", ") || "—"}</td>
                <td className={`r num${out > 0 ? " owing" : ""}`}>{money(out)}</td>
                <td className={`r num${cents(balance?.balance) > 0 ? " owing" : ""}`}>{money(balance?.balance)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
