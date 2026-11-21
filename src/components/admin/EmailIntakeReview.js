"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { loadTenancyOptions, shortDate, tenancyAddress } from "@/lib/rent";

const CATS = ["plumbing", "electrical", "heating_cooling", "appliance", "pests", "doors_locks_windows", "roof_structure", "lawn_snow", "other"];
const catLabel = (c) => c.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());

async function post(id, payload) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(`/api/admin/email-intake/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "That didn't save.");
  return out;
}

function Item({ row, tenancies, onDone }) {
  const [tenancyId, setTenancyId] = useState(row.tenancy_id || "");
  const [issues, setIssues] = useState(
    row.intake?.issues?.length ? row.intake.issues : [{ title: row.subject || "", summary: "", category: "other", urgency: "routine" }]
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (i, k, v) => setIssues((all) => all.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function act(action) {
    setBusy(true);
    setErr("");
    try {
      await post(row.id, action === "approve" ? { action, tenancy_id: tenancyId, issues } : { action });
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }
  return (
    <li className="req">
      <div className="req-top">
        <b>{row.subject || "(no subject)"}</b>
        <span className="small">{shortDate(String(row.received_at).slice(0, 10))}</span>
      </div>
      <span className="small">
        From {row.from_name ? `${row.from_name} · ` : ""}
        {row.from_email}
      </span>
      {row.intake?.reason ? <p className="small" style={{ margin: "4px 0", color: "var(--warn, #9a5b00)" }}>{row.intake.reason}</p> : null}
      <details>
        <summary className="small">Email text{row.attachments?.length ? ` · ${row.attachments.length} photo or video` : ""}</summary>
        <pre className="small" style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{row.body || row.snippet}</pre>
      </details>
      <label className="small">
        Tenancy{" "}
        <select value={tenancyId} onChange={(e) => setTenancyId(e.target.value)}>
          <option value="">Choose…</option>
          {tenancies.map((t) => (
            <option key={t.id} value={t.id}>
              {tenancyAddress(t)} · {(t.tenancy_tenants || []).map((p) => p.full_name).join(", ")}
            </option>
          ))}
        </select>
      </label>
      {issues.map((x, i) => (
        <div key={i} style={{ display: "grid", gap: 4, gridTemplateColumns: "2fr 1fr 1fr auto", alignItems: "center" }}>
          <input aria-label="Issue" value={x.title} onChange={(e) => set(i, "title", e.target.value)} />
          <select aria-label="Category" value={x.category} onChange={(e) => set(i, "category", e.target.value)}>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {catLabel(c)}
              </option>
            ))}
          </select>
          <select aria-label="Urgency" value={x.urgency} onChange={(e) => set(i, "urgency", e.target.value)}>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
          <button type="button" className="link-btn small" onClick={() => setIssues((all) => all.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <div className="req-actions">
        <button type="button" className="link-btn small" onClick={() => setIssues((a) => [...a, { title: "", summary: "", category: "other", urgency: "routine" }])}>
          + Another issue
        </button>
        <button type="button" className="btn sm" disabled={busy || !tenancyId} onClick={() => act("approve")}>
          Log as maintenance
        </button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => act("dismiss")}>
          Not maintenance
        </button>
      </div>
      {err ? <p className="small" role="alert">{err}</p> : null}
    </li>
  );
}

// Staff: maintenance emails the portal couldn't log on its own (unknown sender, landlord,
// leasing-only unit, unclear). Logged ones notify Chuck, the landlord and the tenant as usual.
export default function EmailIntakeReview() {
  const [rows, setRows] = useState(null);
  const [auto, setAuto] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  async function load() {
    const sb = getBrowserClient();
    const [r, a] = await Promise.all([
      sb.from("inbound_emails").select("*").eq("intake_status", "review").order("received_at", { ascending: false }).limit(100),
      sb.from("inbound_emails").select("id, subject, from_name, from_email, received_at, maintenance_request_ids").eq("intake_status", "auto").order("received_at", { ascending: false }).limit(15),
    ]);
    setRows(r.data || []);
    setAuto(a.data || []);
  }
  useEffect(() => {
    load();
    loadTenancyOptions({ includePast: false }).then(setTenancies).catch(() => setTenancies([]));
  }, []);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Maintenance</span>
        <h1 className="admin-title">Review email intake</h1>
        <p className="small">
          Maintenance emails to administration@ that need a person to check. Tenants&apos; emails about their own unit are logged automatically.
        </p>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <p className="small">Nothing to review.</p>
      ) : (
        <ul className="req-list">
          {rows.map((r) => (
            <Item key={r.id} row={r} tenancies={tenancies} onDone={load} />
          ))}
        </ul>
      )}
      {auto.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="h3">Logged automatically</h2>
          <ul className="small" style={{ margin: 0 }}>
            {auto.map((a) => (
              <li key={a.id}>
                {shortDate(String(a.received_at).slice(0, 10))} · {a.from_name || a.from_email}: {a.subject}{" "}
                {(a.maintenance_request_ids || []).map((id, i) => (
                  <Link key={id} href={`/admin/maintenance/${id}`}>
                    request {i + 1}{" "}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
