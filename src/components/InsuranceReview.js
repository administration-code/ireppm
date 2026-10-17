"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

// Proofs of tenant insurance, for staff (mode "staff") or the landlord (mode "owner").
const STATUS = { submitted: "To review", approved: "Approved", rejected: "Not accepted" };
const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "";

async function auth() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

async function loadStaff() {
  const sb = getBrowserClient();
  const [ins, missing] = await Promise.all([
    sb
      .from("tenant_insurance")
      .select("id, tenancy_id, status, file_name, insurer, policy_number, expires_on, review_note, reviewed_as, created_at, tenancy:tenancies(unit:units(label, property:properties(address)))")
      .order("created_at", { ascending: false }),
    sb
      .from("tenancies")
      .select("id, start_date, insurance_due, unit:units(label, property:properties(address)), tenancy_tenants(full_name), tenant_insurance(status)")
      .in("status", ["upcoming", "active", "notice"]),
  ]);
  const rows = (ins.data || []).map((r) => ({ ...r, place: [r.tenancy?.unit?.property?.address, r.tenancy?.unit?.label].filter(Boolean).join(", ") }));
  const none = (missing.data || [])
    .filter((t) => !(t.tenant_insurance || []).some((p) => ["submitted", "approved"].includes(p.status)))
    .map((t) => ({
      id: t.id,
      place: [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", "),
      who: (t.tenancy_tenants || []).map((x) => x.full_name).join(", "),
      due: t.insurance_due,
    }))
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return { rows, none };
}

async function loadOwner() {
  const { data } = await getBrowserClient().rpc("owner_tenant_insurance");
  return { rows: Array.isArray(data) ? data : [], none: [] };
}

function Row({ r, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function view() {
    const res = await fetch(`/api/insurance/file?id=${r.id}`, { headers: await auth() });
    const json = await res.json().catch(() => ({}));
    if (json.url) window.open(json.url, "_blank", "noopener");
    else setError(json.error || "We couldn't open it.");
  }
  async function decide(status) {
    setBusy(status);
    setError("");
    const { error: err } = await getBrowserClient().rpc("review_tenant_insurance", { p_id: r.id, p_status: status, p_note: note || null });
    if (err) {
      setBusy("");
      return setError(err.message);
    }
    await fetch("/api/insurance/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await auth()) },
      body: JSON.stringify({ id: r.id, event: "reviewed" }),
    }).catch(() => {});
    setBusy("");
    onDone();
  }

  return (
    <li className="req">
      <div className="req-top">
        <div className="req-who">
          <h3>{r.place}</h3>
          <p className="small" style={{ margin: 0 }}>
            {[r.insurer, r.policy_number && `Policy ${r.policy_number}`, r.expires_on && `Expires ${longDay(r.expires_on)}`].filter(Boolean).join(" · ") || r.file_name}
            {" · "}Uploaded {longDay(r.created_at)}
          </p>
        </div>
        <span className={`pill ${r.status === "approved" ? "rs-confirmed" : r.status === "rejected" ? "rs-cancelled" : "rs-requested"}`}>
          {STATUS[r.status]}
          {r.reviewed_as ? ` (${r.reviewed_as === "landlord" ? "by landlord" : "by IRep"})` : ""}
        </span>
      </div>
      {r.review_note ? <p className="small">Note: {r.review_note}</p> : null}
      <div className="req-actions" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn ghost sm" onClick={view}>
          View
        </button>
        {r.status === "submitted" ? (
          <>
            <button type="button" className="btn primary sm" disabled={Boolean(busy)} onClick={() => decide("approved")}>
              {busy === "approved" ? "Saving…" : "Approve"}
            </button>
            <input
              aria-label="What's missing (for not accepting)"
              placeholder="What's missing? (to not accept)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => decide("rejected")}>
              {busy === "rejected" ? "Saving…" : "Not accepted"}
            </button>
          </>
        ) : null}
        {error ? <span className="small err">{error}</span> : null}
      </div>
    </li>
  );
}

export default function InsuranceReview({ mode = "staff" }) {
  const [state, setState] = useState({ loading: true, rows: [], none: [] });
  const load = useCallback(async () => {
    const d = mode === "owner" ? await loadOwner() : await loadStaff();
    setState({ loading: false, ...d });
  }, [mode]);
  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <p className="small">Loading…</p>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const sorted = [...state.rows].sort((a, b) => (a.status === "submitted" ? -1 : 0) - (b.status === "submitted" ? -1 : 0));
  return (
    <div className="stack">
      {mode === "staff" && state.none.length ? (
        <section className="boxed stack">
          <h2 className="sec-title">No proof yet ({state.none.length})</h2>
          <ul className="plain-list">
            {state.none.map((t) => (
              <li key={t.id}>
                {t.place}
                {t.who ? ` (${t.who})` : ""}: due {longDay(t.due)}
                {t.due && today > t.due ? <b className="err"> overdue</b> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {sorted.length ? (
        <ul className="req-list">
          {sorted.map((r) => (
            <Row key={r.id} r={r} onDone={load} />
          ))}
        </ul>
      ) : (
        <p className="small">No proofs of insurance uploaded yet.</p>
      )}
    </div>
  );
}
