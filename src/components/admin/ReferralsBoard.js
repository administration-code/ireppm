"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";

async function api(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/admin/referrals", {
    method,
    headers: { Authorization: `Bearer ${data?.session?.access_token || ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" }) : "");
const STATUS = { pending: ["Waiting", "pill st-draft"], credited: ["Month Credited", "pill st-available"], declined: ["Not Eligible", "pill"] };

function PendingRow({ r, owners, properties, onDone, setError }) {
  const [referrer, setReferrer] = useState(r.referrer_owner_id || "");
  const [propertyId, setPropertyId] = useState("");
  const [period, setPeriod] = useState(nextMonth());
  const [busy, setBusy] = useState(false);
  const theirs = properties.filter((p) => p.owner_id === referrer);

  useEffect(() => {
    setPropertyId(theirs[0]?.id || "");
  }, [referrer]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(body, ok) {
    setBusy(true);
    setError("");
    try {
      const r2 = await api("POST", body);
      onDone(typeof ok === "function" ? ok(r2) : ok);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row3">
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`ref-${r.id}`}>Referred by</label>
          <select
            id={`ref-${r.id}`}
            value={referrer}
            onChange={(e) => {
              setReferrer(e.target.value);
              api("POST", { action: "update", id: r.id, referrer_owner_id: e.target.value }).catch(() => {});
            }}
          >
            <option value="">Choose the landlord…</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {r.referrer_text ? <span className="small">They wrote: &ldquo;{r.referrer_text}&rdquo;</span> : null}
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`prop-${r.id}`}>Credit on</label>
          <select id={`prop-${r.id}`} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} disabled={!theirs.length}>
            {theirs.length ? theirs.map((p) => <option key={p.id} value={p.id}>{p.address}</option>) : <option value="">No properties</option>}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`per-${r.id}`}>Free month</label>
          <input id={`per-${r.id}`} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn primary sm"
          disabled={busy || !referrer || !propertyId}
          onClick={() => run({ action: "credit", id: r.id, propertyId, period }, (x) => `Credited ${money(x.amount)} and emailed a thank-you.`)}
        >
          {busy ? "Saving…" : "Credit the Free Month and Thank Them"}
        </button>
        <button type="button" className="link-btn small" disabled={busy} onClick={() => run({ action: "decline", id: r.id, note: "Didn't sign with IRep" }, "Marked not eligible.")}>
          Didn&apos;t Sign Up
        </button>
      </div>
    </div>
  );
}

export default function ReferralsBoard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ referrer_owner_id: "", referred_name: "", referred_email: "" });
  const load = useCallback(() => api("GET").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const ownerName = useMemo(() => Object.fromEntries((data?.owners || []).map((o) => [o.id, o.name])), [data]);
  const propAddr = useMemo(() => Object.fromEntries((data?.properties || []).map((p) => [p.id, p.address])), [data]);

  const done = (m) => {
    setMsg(m);
    load();
  };

  if (!data) return error ? <div className="warnbox">{error}</div> : <p className="small">Loading…</p>;
  const pending = data.referrals.filter((r) => r.status === "pending");
  const past = data.referrals.filter((r) => r.status !== "pending");

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="notebox">
        <strong>How it works</strong>
        A landlord who refers another landlord gets one month&apos;s management fee free (plus HST). Credit it once the new landlord has
        signed and finished their first full month with us. The credit shows on the referrer&apos;s statement for the month you choose and
        is added to their payout, and they&apos;re emailed a thank-you.
      </div>
      {error ? <div className="warnbox" role="alert">{error}</div> : null}
      {msg ? <div className="okbox" role="status">{msg}</div> : null}

      <section className="boxed stack" aria-labelledby="ref-pending" style={{ gap: 14 }}>
        <h2 id="ref-pending" className="sub-title">Waiting ({pending.length})</h2>
        {pending.length ? (
          pending.map((r) => (
            <article key={r.id} className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div>
                <b>{r.referred_name}</b>
                {r.referred_email ? <span className="small"> · {r.referred_email}</span> : null}
                <span className="small"> · added {new Date(r.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</span>
                {r.inquiry_id ? <span className="small"> · from the website inquiry form</span> : null}
              </div>
              <PendingRow r={r} owners={data.owners} properties={data.properties} onDone={done} setError={setError} />
            </article>
          ))
        ) : (
          <p className="small" style={{ margin: 0 }}>No referrals waiting. New landlords who name a referrer on the inquiry form show up here.</p>
        )}
      </section>

      <section className="boxed stack" aria-labelledby="ref-add" style={{ gap: 10 }}>
        <h2 id="ref-add" className="sub-title">Add a Referral</h2>
        <div className="row3">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="ra-who">Referred by</label>
            <select id="ra-who" value={form.referrer_owner_id} onChange={(e) => setForm({ ...form, referrer_owner_id: e.target.value })}>
              <option value="">Choose the landlord…</option>
              {data.owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="ra-name">New landlord&apos;s name</label>
            <input id="ra-name" value={form.referred_name} onChange={(e) => setForm({ ...form, referred_name: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="ra-email">Their email (optional)</label>
            <input id="ra-email" type="email" value={form.referred_email} onChange={(e) => setForm({ ...form, referred_email: e.target.value })} />
          </div>
        </div>
        <button
          type="button"
          className="btn sm"
          style={{ justifySelf: "start" }}
          disabled={!form.referred_name.trim()}
          onClick={() =>
            api("POST", { action: "create", ...form })
              .then(() => {
                setForm({ referrer_owner_id: "", referred_name: "", referred_email: "" });
                done("Referral added.");
              })
              .catch((e) => setError(e.message))
          }
        >
          Add Referral
        </button>
      </section>

      {past.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="sub-title" style={{ margin: 0 }}>History</h2>
          <div className="list table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">New Landlord</th>
                  <th scope="col">Referred By</th>
                  <th scope="col">Thank-You</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {past.map((r) => (
                  <tr key={r.id}>
                    <td className="addr">{r.referred_name}</td>
                    <td>{ownerName[r.referrer_owner_id] || r.referrer_text || "—"}</td>
                    <td className="small">
                      {r.status === "credited"
                        ? `${money(r.credit_amount)} off ${monthLabel(r.credit_period)}, ${propAddr[r.credit_property_id] || ""}${r.thanked_at ? " · emailed" : ""}`
                        : r.notes || ""}
                    </td>
                    <td><span className={STATUS[r.status][1]}>{STATUS[r.status][0]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
