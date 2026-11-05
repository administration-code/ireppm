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
import FrontLobbyReport from "./FrontLobbyReport";

async function loadBoard(month) {
  const sb = getBrowserClient();
  const period = `${month}-01`;
  const gen = await sb.rpc("generate_rent_charges", { p_month: period });
  const [collection, balances, tenancies, unmatched, reports] = await Promise.all([
    sb.from("rent_collection").select("*").eq("period", period),
    sb.from("tenancy_balances").select("tenancy_id, charged, paid, balance, last_paid_on"),
    sb.from("tenancies").select(RENT_TENANCY_SELECT),
    countUnmatched(),
    sb.from("rent_reports").select("tenancy_id, reported_at").order("reported_at", { ascending: false }),
  ]);
  const lastReported = {};
  for (const r of reports.data || []) if (!lastReported[r.tenancy_id]) lastReported[r.tenancy_id] = r.reported_at;
  const failed = gen.error || collection.error || balances.error || tenancies.error;
  return {
    collection: collection.data || [],
    balances: balances.data || [],
    tenancies: tenancies.data || [],
    unmatched,
    lastReported,
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
  const [who, setWho] = useState("all");
  const [how, setHow] = useState("");
  const [copied, setCopied] = useState("");

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

  const { groups, totals, arrears, people } = useMemo(() => {
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
      // One row per tenant: everyone charged this month, plus anyone else who still owes (moved out, say).
      people: [
        ...collection.map((c) => ({ id: c.tenancy_id, c, tenancy: byTenancy.get(c.tenancy_id), balance: balanceOf.get(c.tenancy_id) })),
        ...balances
          .filter((b) => cents(b.balance) > 0 && !collection.some((c) => c.tenancy_id === b.tenancy_id))
          .map((b) => ({ id: b.tenancy_id, c: null, tenancy: byTenancy.get(b.tenancy_id), balance: b })),
      ]
        .map((p) => ({
          ...p,
          name: p.tenancy ? primaryTenant(p.tenancy) : "Unknown tenancy",
          address: p.tenancy ? tenancyAddress(p.tenancy) : "—",
          monthOwing: p.c ? owing(p.c.outstanding) : 0,
          totalOwing: owing(p.balance?.balance),
        }))
        .map((p) => ({ ...p, behind: cents(p.monthOwing) > 0 || cents(p.totalOwing) > 0 }))
        .sort((a, b) => String(a.address).localeCompare(String(b.address)) || String(a.name).localeCompare(String(b.name))),
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

      <TenantsPaid
        month={month}
        loading={loading}
        people={people}
        who={who}
        setWho={setWho}
        how={how}
        setHow={setHow}
        copied={copied}
        setCopied={setCopied}
      />

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
                  <th scope="col">Credit reporting</th>
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
                    <td>
                      {a.tenancy ? (
                        <FrontLobbyReport
                          tenancy={a.tenancy}
                          balance={a.balance}
                          lastPaid={a.last_paid_on}
                          lastReported={state.lastReported?.[a.tenancy_id]}
                          onReported={(at) => setState((s) => ({ ...s, lastReported: { ...(s.lastReported || {}), [a.tenancy_id]: at } }))}
                        />
                      ) : null}
                    </td>
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

// Paid vs in arrears, one row per tenant, so staff can update PayProp quickly.
function TenantsPaid({ month, loading, people: everyone, who, setWho, how, setHow, copied, setCopied }) {
  const methodsOf = (p) => p.c?.methods || [];
  const methodsUsed = [...new Set(everyone.flatMap(methodsOf))].sort((a, b) =>
    String(METHOD_LABEL[a] || a).localeCompare(String(METHOD_LABEL[b] || b))
  );
  const people = !how ? everyone : how === "none" ? everyone.filter((p) => !methodsOf(p).length) : everyone.filter((p) => methodsOf(p).includes(how));
  const paid = people.filter((p) => !p.behind);
  const behind = people.filter((p) => p.behind);
  const shown = who === "paid" ? paid : who === "arrears" ? behind : people;

  async function copy() {
    const lines = [
      ["Tenant", "Rental unit", "Paid by", `${monthLabel(`${month}-01`)} owing`, "Total owing", "Last paid"].join("\t"),
      ...shown.map((p) =>
        [
          p.name,
          p.address,
          methodsOf(p).map((m) => METHOD_LABEL[m] || m).join(", "),
          p.monthOwing.toFixed(2),
          p.totalOwing.toFixed(2),
          p.balance?.last_paid_on || p.c?.last_paid_on || "",
        ].join("\t")
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(`Copied ${shown.length} row${shown.length === 1 ? "" : "s"}. Paste into a spreadsheet or email.`);
    } catch {
      setCopied("Your browser blocked copying. Select the table and copy it instead.");
    }
  }

  return (
    <section className="boxed stack" aria-labelledby="sec-tenants-paid">
      <div className="sec-head">
        <h2 id="sec-tenants-paid" className="sec-title" style={{ margin: 0 }}>
          Tenants: Paid or in Arrears
        </h2>
        <div className="seg" role="group" aria-label="Show tenants">
          {[
            ["all", `All (${people.length})`],
            ["paid", `Paid (${paid.length})`],
            ["arrears", `In arrears (${behind.length})`],
          ].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={who === k} onClick={() => (setWho(k), setCopied(""))}>
              {label}
            </button>
          ))}
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor="tp-how" className="visually-hidden">
            How they paid
          </label>
          <select id="tp-how" value={how} onChange={(e) => (setHow(e.target.value), setCopied(""))}>
            <option value="">Any way they paid</option>
            {methodsUsed.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m] || m}
              </option>
            ))}
            <option value="none">No payment this month</option>
          </select>
        </div>
        <button type="button" className="btn ghost sm" onClick={copy} disabled={loading || !shown.length}>
          Copy list
        </button>
      </div>
      <p className="small" style={{ margin: 0 }}>
        Paid means {monthLabel(`${month}-01`)} rent is in full and nothing is owing from earlier months. In arrears means anything is owing,
        this month or earlier (including tenants who have moved out).
      </p>
      {copied ? (
        <p className="small" role="status" style={{ margin: 0 }}>
          {copied}
        </p>
      ) : null}
      {loading ? (
        <p className="small">Loading…</p>
      ) : !shown.length ? (
        <p className="small">{who === "arrears" ? "Nobody is behind." : who === "paid" ? "Nobody has paid in full yet." : "No tenants this month."}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Tenant</th>
                <th scope="col">Rental unit</th>
                <th scope="col" className="r">Due this month</th>
                <th scope="col" className="r">Paid this month</th>
                <th scope="col">Paid by</th>
                <th scope="col" className="r">Owing this month</th>
                <th scope="col" className="r">Total owing</th>
                <th scope="col">Last paid</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="addr">{p.name}</td>
                  <td>
                    {p.tenancy?.unit ? <Link href={`/admin/units/${p.tenancy.unit.id}`}>{p.address}</Link> : p.address}
                    {p.tenancy?.status === "ended" ? <span className="small"> · moved out</span> : null}
                  </td>
                  <td className="r num">{p.c ? money(p.c.due) : "—"}</td>
                  <td className="r num">{p.c ? money(p.c.paid) : "—"}</td>
                  <td className="small">{methodsOf(p).map((m) => METHOD_LABEL[m] || m).join(", ") || "—"}</td>
                  <td className={`r num${cents(p.monthOwing) > 0 ? " owing" : ""}`}>{money(p.monthOwing)}</td>
                  <td className={`r num${cents(p.totalOwing) > 0 ? " owing" : ""}`}>{money(p.totalOwing)}</td>
                  <td>{shortDate(p.balance?.last_paid_on || p.c?.last_paid_on) || "—"}</td>
                  <td>
                    <span className={`pill ${p.behind ? "cs-none" : "cs-full"}`}>{p.behind ? "In arrears" : "Paid"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
