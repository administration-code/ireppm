"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TapPick from "./TapPick";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";

const KINDS = { rent: "Rent", last_month_rent: "Last month's rent", other: "Something else" };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

async function call(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/cash", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

// Chuck: log cash a tenant gave him, then tick it off when he deposits it.
export default function AgentCash() {
  const { user, ready, openSignIn } = useAuth();
  const [d, setD] = useState(null);
  const [f, setF] = useState({ tenancy_id: "", amount: "", kind: "rent", collected_on: today(), note: "" });
  const [msg, setMsg] = useState({ log: "", dep: "" });
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState({});
  const [dep, setDep] = useState({ deposited_on: today(), method: "bank_deposit", amount: "", note: "" });

  const load = useCallback(async () => setD(await call("GET")), []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const byId = useMemo(() => new Map((d?.tenancies || []).map((t) => [t.id, t])), [d]);
  const tickedRows = (d?.held || []).filter((c) => ticked[c.id]);
  const tickedTotal = tickedRows.reduce((s, c) => s + Math.round(Number(c.amount) * 100), 0) / 100;

  if (!ready) return <p className="small">Loading…</p>;
  if (!user)
    return (
      <div className="empty">
        <h1>Cash</h1>
        <button type="button" className="btn primary" onClick={() => openSignIn("/agent/cash")}>
          Sign in
        </button>
      </div>
    );
  if (!d) return <p className="small">Loading…</p>;
  if (!d.allowed)
    return (
      <div className="empty">
        <h1>Cash</h1>
        <p>Your account isn&apos;t set up to log cash. Ask Rosie.</p>
      </div>
    );

  async function save(e) {
    e.preventDefault();
    if (!f.tenancy_id) return setMsg((m) => ({ ...m, log: "Choose the tenant." }));
    if (!(Number(f.amount) > 0)) return setMsg((m) => ({ ...m, log: "Enter the amount." }));
    setBusy(true);
    const out = await call("POST", { action: "log", ...f });
    setBusy(false);
    if (out.error) return setMsg((m) => ({ ...m, log: out.error }));
    setMsg((m) => ({ ...m, log: `Saved: ${money(Number(f.amount))} from ${out.tenant}. Rosie can see it now.` }));
    setF({ tenancy_id: "", amount: "", kind: "rent", collected_on: today(), note: "" });
    load();
  }
  async function cancel(id) {
    setBusy(true);
    const out = await call("POST", { action: "cancel", id });
    setBusy(false);
    if (out.error) setMsg((m) => ({ ...m, dep: out.error }));
    load();
  }
  async function deposit(e) {
    e.preventDefault();
    if (!tickedRows.length) return setMsg((m) => ({ ...m, dep: "Tick the cash you deposited." }));
    setBusy(true);
    const out = await call("POST", { action: "deposit", ids: tickedRows.map((c) => c.id), ...dep, amount: dep.amount === "" ? undefined : dep.amount });
    setBusy(false);
    if (out.error) return setMsg((m) => ({ ...m, dep: out.error }));
    setMsg((m) => ({ ...m, dep: `Saved: ${money(dep.amount === "" ? tickedTotal : Number(dep.amount))} deposited ${shortDate(dep.deposited_on)}.` }));
    setTicked({});
    setDep({ deposited_on: today(), method: "bank_deposit", amount: "", note: "" });
    load();
  }

  const cashFirst = d.tenancies.filter((t) => t.paysCash);
  const others = d.tenancies.filter((t) => !t.paysCash);
  const label = (t) => `${t.names} · ${t.place}`;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">
          <Link href="/agent">Agent Portal</Link>
        </span>
        <h1 className="admin-title">Cash</h1>
        <p className="small">Log cash as soon as a tenant gives it to you. When you deposit it, tick it off below.</p>
      </div>

      <form className="boxed stack" onSubmit={save} aria-labelledby="cash-log">
        <h2 id="cash-log" className="sec-title">
          I Got Cash
        </h2>
        <TenantPick
          cashFirst={cashFirst}
          others={others}
          label={label}
          value={f.tenancy_id}
          onChange={(v) => {
            const t = byId.get(v);
            setF((s) => ({ ...s, tenancy_id: v, amount: s.amount || (t?.rent ? String(t.rent) : "") }));
          }}
        />
        <div className="req-actions" style={{ flexWrap: "wrap" }}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">Amount</span>
            <input inputMode="decimal" value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="0.00" style={{ width: 120 }} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">Date you got it</span>
            <input type="date" max={today()} value={f.collected_on} onChange={(e) => setF((s) => ({ ...s, collected_on: e.target.value }))} />
          </label>
        </div>
        <TapPick label="For" options={KINDS} value={f.kind} onChange={(v) => setF((s) => ({ ...s, kind: v }))} />
        <input placeholder="Note (optional)" value={f.note} onChange={(e) => setF((s) => ({ ...s, note: e.target.value }))} />
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            Save
          </button>
          {msg.log ? <span className="small">{msg.log}</span> : null}
        </div>
      </form>

      <form className={`boxed stack${d.held.length ? " attention" : ""}`} onSubmit={deposit} aria-labelledby="cash-held">
        <h2 id="cash-held" className="sec-title">
          Cash You&apos;re Holding{d.held.length ? ` (${money(d.held.reduce((s, c) => s + Number(c.amount), 0))})` : ""}
        </h2>
        {d.held.length ? (
          <>
            <ul className="plain-list">
              {d.held.map((c) => {
                const t = byId.get(c.tenancy_id);
                return (
                  <li key={c.id}>
                    <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <input type="checkbox" checked={!!ticked[c.id]} onChange={(e) => setTicked((s) => ({ ...s, [c.id]: e.target.checked }))} />
                      <span>
                        <b>{money(Number(c.amount))}</b> · {t ? label(t) : "Tenant"} · got it {shortDate(c.collected_on)}
                        {c.kind !== "rent" ? ` · ${KINDS[c.kind] || "Other"}` : ""}
                      </span>
                    </label>
                    <button type="button" className="link-btn small" onClick={() => cancel(c.id)} disabled={busy}>
                      Remove (entered by mistake)
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="req-actions" style={{ flexWrap: "wrap" }}>
              <TapPick
                label="How"
                options={[["bank_deposit", "Deposited at the bank"], ["etransfer", "e-Transferred to IRep"]]}
                value={dep.method}
                onChange={(v) => setDep((s) => ({ ...s, method: v }))}
              />
              <label className="stack" style={{ gap: 4 }}>
                <span className="small">Date</span>
                <input type="date" max={today()} value={dep.deposited_on} onChange={(e) => setDep((s) => ({ ...s, deposited_on: e.target.value }))} />
              </label>
              <label className="stack" style={{ gap: 4 }}>
                <span className="small">Amount (if different)</span>
                <input inputMode="decimal" value={dep.amount} placeholder={tickedTotal ? tickedTotal.toFixed(2) : "0.00"} onChange={(e) => setDep((s) => ({ ...s, amount: e.target.value.replace(/[^\d.]/g, "") }))} style={{ width: 120 }} />
              </label>
            </div>
            {dep.amount !== "" && Number(dep.amount) !== tickedTotal ? (
              <input placeholder="Why is the amount different?" value={dep.note} onChange={(e) => setDep((s) => ({ ...s, note: e.target.value }))} />
            ) : null}
            <div className="req-actions">
              <button type="submit" className="btn primary" disabled={busy || !tickedRows.length}>
                {tickedRows.length ? `I Deposited ${money(dep.amount === "" ? tickedTotal : Number(dep.amount))}` : "Tick the Cash You Deposited"}
              </button>
              {msg.dep ? <span className="small">{msg.dep}</span> : null}
            </div>
          </>
        ) : (
          <p className="small">Nothing. {msg.dep}</p>
        )}
      </form>

      {d.deposits.length ? (
        <section className="boxed stack" aria-labelledby="cash-deps">
          <h2 id="cash-deps" className="sec-title">
            Your Deposits (Last 60 Days)
          </h2>
          <ul className="plain-list">
            {d.deposits.map((x) => (
              <li key={x.id}>
                <b>{money(Number(x.amount))}</b> · {x.method === "etransfer" ? "e-Transfer" : "bank deposit"} {shortDate(x.deposited_on)} ·{" "}
                {(x.cash_collections || []).map((c) => byId.get(c.tenancy_id)?.names || "Tenant").join(", ")}
                <span className="small"> · {x.bank_transaction_id ? "matched to the bank ✓" : "waiting for the bank statement"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// Tenants who usually pay cash as big buttons; everyone else behind a search box.
function TenantPick({ cashFirst, others, label, value, onChange }) {
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const chosenOther = others.find((t) => t.id === value);
  const found = q.trim().length >= 2 ? others.filter((t) => label(t).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : [];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <TapPick label="From" grid options={cashFirst.map((t) => [t.id, label(t)])} value={value} onChange={onChange} />
      {chosenOther ? (
        <TapPick options={[[chosenOther.id, label(chosenOther)]]} value={value} onChange={onChange} clearable />
      ) : more ? (
        <div className="stack" style={{ gap: 6 }}>
          <input autoFocus placeholder="Type the tenant's name or street" value={q} onChange={(e) => setQ(e.target.value)} />
          {found.length ? <TapPick grid options={found.map((t) => [t.id, label(t)])} value={value} onChange={(v) => (onChange(v), setMore(false), setQ(""))} /> : null}
        </div>
      ) : (
        <button type="button" className="link-btn small" style={{ width: "fit-content" }} onClick={() => setMore(true)}>
          Someone else
        </button>
      )}
    </div>
  );
}
