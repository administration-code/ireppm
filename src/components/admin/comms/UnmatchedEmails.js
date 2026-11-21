"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { loadTenancyOptions, tenancyAddress } from "@/lib/rent";
import { LABELS, gmailLink } from "@/components/admin/comms/Communications";

const KINDS = [
  ["tenant", "Tenant"],
  ["landlord", "Landlord"],
  ["partner", "Partner or contractor"],
  ["applicant", "Applicant"],
  ["ignored", "Not a contact (ignore)"],
];

function Assign({ group, options, onDone }) {
  const [kind, setKind] = useState("tenant");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const list = options[kind] || [];
  async function save() {
    setBusy(true);
    setErr("");
    const { data } = await getBrowserClient().auth.getSession();
    const chosen = list.find((o) => o.id === target);
    const res = await fetch("/api/admin/email-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify({ email: group.email, party_kind: kind, target_id: target || null, name: chosen?.name || group.name }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(out.error || "That didn't save.");
    onDone();
  }
  return (
    <div className="req-actions" style={{ flexWrap: "wrap" }}>
      <select aria-label="Who is this" value={kind} onChange={(e) => (setKind(e.target.value), setTarget(""))}>
        {KINDS.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {kind !== "ignored" ? (
        <select aria-label="Choose" value={target} onChange={(e) => setTarget(e.target.value)} style={{ maxWidth: 360 }}>
          <option value="">Choose…</option>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
      <button type="button" className="btn sm" disabled={busy || (kind !== "ignored" && !target)} onClick={save}>
        {busy ? "Saving…" : "Assign and Remember"}
      </button>
      {err ? <span className="small" role="alert">{err}</span> : null}
    </div>
  );
}

// Staff: emails whose address the portal doesn't know. Assign it once and every email from it,
// past and future, goes on that person's timeline.
export default function UnmatchedEmails() {
  const [rows, setRows] = useState(null);
  const [options, setOptions] = useState({});
  async function load() {
    const { data } = await getBrowserClient()
      .from("inbound_emails")
      .select("id, party_email, from_name, from_email, direction, subject, snippet, received_at, category, thread_id, hidden_attachments")
      .eq("party_kind", "unmatched")
      .not("party_email", "is", null)
      .order("received_at", { ascending: false })
      .limit(500);
    setRows(data || []);
  }
  useEffect(() => {
    load();
    (async () => {
      const sb = getBrowserClient();
      const [tenancies, owners, partners, apps] = await Promise.all([
        loadTenancyOptions({ includePast: true }).catch(() => []),
        sb.from("owners").select("id, name, email").order("name"),
        sb.from("partners").select("id, name, company").eq("active", true).order("name"),
        sb.from("applications").select("id, applicant_name, applicant_email, created_at").order("created_at", { ascending: false }).limit(200),
      ]);
      setOptions({
        tenant: tenancies.map((t) => {
          const names = (t.tenancy_tenants || []).map((p) => p.full_name).join(", ");
          return { id: t.id, name: names, label: `${tenancyAddress(t)} · ${names}${t.status === "ended" ? " (ended)" : ""}` };
        }),
        landlord: (owners.data || []).map((o) => ({ id: o.id, name: o.name, label: o.name })),
        partner: (partners.data || []).map((p) => ({ id: p.id, name: p.company || p.name, label: [p.name, p.company].filter(Boolean).join(" · ") })),
        applicant: (apps.data || []).map((a) => ({ id: a.id, name: a.applicant_name, label: `${a.applicant_name || "Applicant"} · ${String(a.created_at).slice(0, 10)}` })),
      });
    })();
  }, []);
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) {
      if (!m.has(r.party_email)) m.set(r.party_email, { email: r.party_email, name: r.direction === "in" ? r.from_name : null, items: [] });
      m.get(r.party_email).items.push(r);
    }
    return [...m.values()];
  }, [rows]);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Communications</span>
        <h1 className="admin-title">Unmatched Emails</h1>
        <p className="small">Addresses the portal couldn&apos;t match to a tenant, landlord, applicant or partner. Assign each address once and the portal remembers it.</p>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !groups.length ? (
        <p className="small">Every email is matched.</p>
      ) : (
        <ul className="req-list">
          {groups.map((g) => (
            <li key={g.email} className="req">
              <div className="req-top">
                <b>{g.name ? `${g.name} · ${g.email}` : g.email}</b>
                <span className="small">{g.items.length} email{g.items.length === 1 ? "" : "s"}</span>
              </div>
              {g.items.slice(0, 3).map((r) => (
                <span key={r.id} className="small">
                  {r.direction === "out" ? "→" : "←"} {String(r.received_at).slice(0, 10)} · {LABELS[r.category] || "General"} · {r.subject || "(no subject)"}{" "}
                  {gmailLink(r.thread_id) ? (
                    <a href={gmailLink(r.thread_id)} target="_blank" rel="noreferrer">
                      Gmail
                    </a>
                  ) : null}
                </span>
              ))}
              <Assign group={g} options={options} onDone={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
