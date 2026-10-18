"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";

async function api(method, body, query = "") {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(`/api/admin/draw${query}`, {
    method,
    headers: { Authorization: `Bearer ${data?.session?.access_token || ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

const day = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "");
const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7);
const METHOD = { payprop: "PayProp", etransfer: "e-Transfer", cash: "Cash", direct_deposit: "Direct deposit", cheque: "Cheque", last_month_applied: "Last month", paid_to_owner: "Paid to owner", other: "Other" };

function useChecks(month) {
  const key = `irep-draw-checks-${month}`;
  const [checks, setChecks] = useState({});
  useEffect(() => {
    try {
      setChecks(JSON.parse(localStorage.getItem(key) || "{}"));
    } catch {
      setChecks({});
    }
  }, [key]);
  const toggle = (k) =>
    setChecks((c) => {
      const n = { ...c, [k]: !c[k] };
      try {
        localStorage.setItem(key, JSON.stringify(n));
      } catch {}
      return n;
    });
  return [checks, toggle];
}

export default function PaypropDraw() {
  const router = useRouter();
  const params = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get("month") || "") ? params.get("month") : thisMonth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [onlyOnTime, setOnlyOnTime] = useState(true);
  const [checks, toggle] = useChecks(month);

  const load = useCallback(() => {
    setError("");
    return api("GET", null, `?month=${month}`).then(setData).catch((e) => setError(e.message));
  }, [month]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  async function act(action, done) {
    setBusy(action);
    setMsg("");
    setError("");
    try {
      const r = await api("POST", { month, action });
      setMsg(typeof done === "function" ? done(r) : done);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const rows = data?.rows || [];
  const onTime = rows.filter((r) => r.paid_on_time);
  const entered = rows.filter((r) => r.entered);
  const d = data?.draw;
  const shown = onlyOnTime ? onTime : rows;

  const steps = [
    ["imported", "Record every payment received up to the 7th (PayProp report and Interac emails)", checks.imported],
    ["reviewed", "Check the paid-by-the-7th list below", checks.reviewed],
    ["drawn", "Draw the winner from the PayProp entries", Boolean(d?.drawn_at)],
    ["emailed", "Email the winner", Boolean(d?.winner_emailed_at)],
    ["gift", "Send the $100 gift card", Boolean(d?.gift_card_sent_at)],
    ["payouts", "Send landlord payouts for tenancies paid by the 7th", checks.payouts],
  ];
  const manual = new Set(["imported", "reviewed", "payouts"]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="draw-month">Month</label>
          <input id="draw-month" type="month" value={month} onChange={(e) => e.target.value && router.replace(`/admin/rent/draw?month=${e.target.value}`)} />
        </div>
        {data ? (
          <p className="small" style={{ margin: 0 }}>
            <b>{onTime.length}</b> of {rows.length} paid in full by the 7th · <b>{entered.length}</b> in the draw (PayProp, paid by {day(data.drawBy)})
          </p>
        ) : null}
      </div>

      {error ? <div className="warnbox">{error}</div> : null}
      {msg ? <div className="okbox" role="status">{msg}</div> : null}

      <section className="boxed stack" aria-labelledby="draw-steps" style={{ gap: 10 }}>
        <h2 id="draw-steps" className="sub-title">This Month&apos;s Checklist</h2>
        <ol className="plain-list" style={{ gap: 8 }}>
          {steps.map(([k, label, done]) => (
            <li key={k}>
              <label className="check" style={{ alignItems: "flex-start" }}>
                <input type="checkbox" checked={Boolean(done)} disabled={!manual.has(k)} onChange={() => toggle(k)} />
                <span style={done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{label}</span>
              </label>
            </li>
          ))}
        </ol>
        <p className="small" style={{ margin: 0 }}>
          The draw steps tick themselves. A short list is emailed to staff on the 8th of each month.
        </p>
      </section>

      <section className="boxed stack" aria-labelledby="draw-winner" style={{ gap: 10 }}>
        <h2 id="draw-winner" className="sub-title">Gift Card Draw</h2>
        {d?.winner_tenancy_id ? (
          <>
            <p style={{ margin: 0 }}>
              <b>{d.winner_name}</b> won, drawn {day(d.drawn_at)} from {d.entries} {d.entries === 1 ? "entry" : "entries"}.
              {d.winner_email ? <span className="small"> {d.winner_email}</span> : <span className="small"> No email on file.</span>}
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn primary sm" disabled={Boolean(busy) || !d.winner_email} onClick={() => act("email", "Congratulations email sent.")}>
                {busy === "email" ? "Sending…" : d.winner_emailed_at ? "Email again" : "Email the winner"}
              </button>
              <button type="button" className="btn ghost sm" disabled={Boolean(busy) || Boolean(d.gift_card_sent_at)} onClick={() => act("gift_sent", "Marked as sent.")}>
                {d.gift_card_sent_at ? `Gift card sent ${day(d.gift_card_sent_at)}` : "Mark gift card sent"}
              </button>
              {!d.winner_emailed_at ? (
                <button type="button" className="link-btn small" disabled={Boolean(busy)} onClick={() => act("reset", "Draw cleared. You can draw again.")}>
                  Clear and redraw
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn primary" disabled={Boolean(busy) || !entered.length} onClick={() => act("draw", (r) => `${r.winner.tenant} was drawn from ${r.entries} entries.`)}>
              {busy === "draw" ? "Drawing…" : `Draw a winner from ${entered.length} ${entered.length === 1 ? "entry" : "entries"}`}
            </button>
            <span className="small">Picked at random. Entries: paid in full through PayProp on or before the 7th.</span>
          </div>
        )}
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 className="sub-title" style={{ margin: 0 }}>{onlyOnTime ? "Paid by the 7th" : "Everyone due rent"}</h2>
          <label className="check">
            <input type="checkbox" checked={onlyOnTime} onChange={(e) => setOnlyOnTime(e.target.checked)} />
            Only paid by the 7th
          </label>
        </div>
        {!data ? (
          <p className="small">Loading…</p>
        ) : shown.length ? (
          <div className="list table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Tenant</th>
                  <th scope="col">Home</th>
                  <th scope="col" className="num">Paid by the 7th</th>
                  <th scope="col">How</th>
                  <th scope="col">Draw</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.tenancy_id}>
                    <td className="addr">{r.tenant}</td>
                    <td className="small">{r.place}</td>
                    <td className="num">
                      {money(r.paid_by_7th)} <span className="small">of {money(r.due)}</span>
                    </td>
                    <td className="small">{r.methods.map((m) => METHOD[m] || m).join(", ") || "None yet"}</td>
                    <td>
                      {r.entered ? (
                        <span className="pill st-available">Entered</span>
                      ) : r.used_payprop ? (
                        <span className="pill st-draft">PayProp, late or partial</span>
                      ) : (
                        <span className="small">Not PayProp</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small">Nobody yet for this month.</p>
        )}
      </section>
      <p className="small">
        <Link href="/admin/rent">Back to the rent board</Link>
      </p>
    </div>
  );
}
