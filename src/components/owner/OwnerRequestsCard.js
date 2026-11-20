"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate, monthLabel } from "@/lib/rent";
import { REQUEST_KINDS, kindLabel, needsMonth } from "@/lib/owner-requests";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}
const day = (ts) => shortDate(new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }));
const lastMonth = () => {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) + "T12:00:00");
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};
// Rent and statements aren't handled by IRep for leasing-only landlords.
const LEASING_KINDS = ["tenancy_list", "documents", "other"];
const blank = () => ({ kind: "", property_id: "", period: lastMonth(), message: "" });

// Landlord portal: ask IRep for information, and see past requests and our replies.
export default function OwnerRequestsCard({ properties = [], leasingOnly = false }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [list, setList] = useState([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/requests", { headers: await authHeader() }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => ({})) : {};
    setList(Array.isArray(json.requests) ? json.requests : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // The "Request information" button at the top of the portal opens the form here.
  useEffect(() => {
    const show = () => {
      setOpen(true);
      setSent(false);
    };
    window.addEventListener("owner-request-open", show);
    if (window.location.hash === "#requests") show();
    return () => window.removeEventListener("owner-request-open", show);
  }, []);

  const set = (k) => (e) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    setError("");
  };
  const kind = REQUEST_KINDS.find((k) => k.value === f.kind);

  async function submit(e) {
    e.preventDefault();
    if (!f.kind) return setError("Choose what you'd like.");
    if (f.kind === "other" && !f.message.trim()) return setError("Tell us what you need.");
    setBusy(true);
    setError("");
    const res = await fetch("/api/owner/requests", {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, period: needsMonth(f.kind) ? f.period : undefined, property_id: f.property_id || undefined }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(json.error || "That didn't send. Try again.");
    setSent(true);
    setOpen(false);
    setF(blank());
    load();
  }

  return (
    <section className="boxed stack" aria-labelledby="sec-own-req" id="requests">
      <h2 id="sec-own-req" className="sec-title">
        Request Information
      </h2>
      <p className="small" style={{ margin: 0 }}>
        {leasingOnly
          ? "Need a copy of a lease, tenant details or anything else? Send us a request and we'll reply by email."
          : "Need a list of your tenancies, a statement, copies of documents or anything else? Send us a request and we'll reply by email. You can also see who has paid rent this month, your statements and your year-end summary on this page any time."}
      </p>
      {sent && !open ? (
        <div className="okbox" role="status">
          Got it. We&apos;ll reply by email and the answer will show below.
        </div>
      ) : null}
      {!open ? (
        <div>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setOpen(true);
              setSent(false);
            }}
          >
            Request Information
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="req-kind">What would you like?</label>
            <select id="req-kind" value={f.kind} onChange={set("kind")}>
              <option value="">Choose…</option>
              {REQUEST_KINDS.filter((k) => !leasingOnly || LEASING_KINDS.includes(k.value)).map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            {kind ? <span className="small">{kind.hint}</span> : null}
          </div>
          <div className="row2">
            {properties.length > 1 ? (
              <div className="field">
                <label htmlFor="req-prop">Property</label>
                <select id="req-prop" value={f.property_id} onChange={set("property_id")}>
                  <option value="">All my properties</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.address}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {needsMonth(f.kind) ? (
              <div className="field">
                <label htmlFor="req-month">Month</label>
                <input id="req-month" type="month" value={f.period} onChange={set("period")} />
              </div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="req-msg">Details{f.kind === "other" ? "" : " (optional)"}</label>
            <textarea id="req-msg" rows={4} maxLength={2000} value={f.message} onChange={set("message")} />
          </div>
          {error ? (
            <div className="warnbox" role="alert">
              {error}
            </div>
          ) : null}
          <div className="req-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Sending…" : "Send Request"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {list.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <caption className="visually-hidden">Your requests</caption>
            <thead>
              <tr>
                <th scope="col">Sent</th>
                <th scope="col">Request</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{day(r.created_at)}</td>
                  <td>
                    {kindLabel(r.kind)}
                    {r.period ? ` · ${monthLabel(r.period)}` : ""}
                    {r.property?.address ? <span className="sub-line small">{r.property.address}</span> : null}
                    {r.message ? <span className="sub-line small">{r.message}</span> : null}
                    {r.staff_reply ? (
                      <span className="sub-line small" style={{ whiteSpace: "pre-wrap" }}>
                        <strong>IRep:</strong> {r.staff_reply}
                      </span>
                    ) : null}
                  </td>
                  <td>{r.status === "done" ? `Answered ${r.done_at ? day(r.done_at) : ""}` : "Open"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
