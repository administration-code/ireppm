"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { primaryTenant, shortDate, todayISO } from "@/lib/rent";
import { loadTenancies, tenancyPlace } from "@/lib/accounting";

const KIND = { rent: "Rent", last_month_rent: "Last month's rent", key_deposit: "Key deposit", other: "Other" };
const days = (d) => Math.round((Date.parse(`${todayISO()}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000);

// Staff: cash Chuck has logged in the Agent Portal: what he's still holding, and his deposits with their bank match.
export default function CashBoard() {
  const [state, setState] = useState(null);
  useEffect(() => {
    (async () => {
      const sb = getBrowserClient();
      const { data: s } = await sb.auth.getSession();
      await fetch("/api/admin/cash", { method: "POST", headers: { Authorization: `Bearer ${s?.session?.access_token || ""}` } }).catch(() => null);
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const [{ data: held }, { data: deps }] = await Promise.all([
        sb.from("cash_collections").select("id, tenancy_id, amount, collected_on, kind, note").eq("status", "held").order("collected_on"),
        sb
          .from("cash_deposits")
          .select("id, deposited_on, amount, method, note, bank_transaction_id, bank:bank_transactions(posted_on, description), cash_collections(tenancy_id, amount, collected_on, kind)")
          .gte("deposited_on", since)
          .order("deposited_on", { ascending: false }),
      ]);
      const ids = [...(held || []).map((c) => c.tenancy_id), ...(deps || []).flatMap((d) => (d.cash_collections || []).map((c) => c.tenancy_id))];
      setState({ held: held || [], deps: deps || [], ten: await loadTenancies(ids) });
    })();
  }, []);
  if (!state) return <p className="small">Loading…</p>;
  const who = (id) => {
    const t = state.ten.get(id);
    return t ? `${primaryTenant(t)} · ${tenancyPlace(t)}` : "Tenant";
  };
  const heldTotal = state.held.reduce((s, c) => s + Number(c.amount), 0);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Accounting</span>
        <h1 className="admin-title">Cash from Chuck</h1>
        <p className="small">
          Chuck logs cash in the Agent Portal when a tenant pays him, which records the rent payment straight away. When he deposits it at the bank, the
          deposit is matched to the bank line here once the bank file is imported.
        </p>
      </div>

      <section className={`boxed stack${state.held.some((c) => days(c.collected_on) > 3) ? " attention" : ""}`}>
        <h2 className="sec-title">Chuck Is Holding {state.held.length ? money(heldTotal) : ""}</h2>
        {state.held.length ? (
          <ul className="plain-list">
            {state.held.map((c) => (
              <li key={c.id}>
                <b>{money(Number(c.amount))}</b> · {who(c.tenancy_id)} · {KIND[c.kind]} · got it {shortDate(c.collected_on)}
                {days(c.collected_on) > 3 ? <b className="err"> · {days(c.collected_on)} days, not deposited</b> : null}
                {c.note ? <span className="sub-line small">{c.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">Nothing.</p>
        )}
      </section>

      <section className="boxed stack">
        <h2 className="sec-title">Deposits (Last 90 Days)</h2>
        {state.deps.length ? (
          <ul className="plain-list">
            {state.deps.map((d) => {
              const sum = (d.cash_collections || []).reduce((s, c) => s + Number(c.amount), 0);
              return (
                <li key={d.id}>
                  <b>{money(Number(d.amount))}</b> · {d.method === "etransfer" ? "e-Transfer to IRep" : "bank deposit"} {shortDate(d.deposited_on)} ·{" "}
                  {d.bank_transaction_id ? (
                    <span>matched to the bank line {shortDate(d.bank?.posted_on)} ✓</span>
                  ) : d.method === "etransfer" ? (
                    <span>match the e-Transfer in Reconciliation</span>
                  ) : (
                    <b className="err">no matching bank line yet</b>
                  )}
                  <span className="sub-line small">
                    {(d.cash_collections || []).map((c) => `${money(Number(c.amount))} ${who(c.tenancy_id)} (${shortDate(c.collected_on)})`).join("; ")}
                    {Math.round(sum * 100) !== Math.round(Number(d.amount) * 100) ? ` · cash logged ${money(sum)}, deposited ${money(Number(d.amount))}` : ""}
                    {d.note ? ` · Chuck: ${d.note}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="small">No deposits logged yet.</p>
        )}
      </section>
    </div>
  );
}
