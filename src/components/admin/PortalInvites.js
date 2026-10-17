"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

async function api(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/admin/invites", {
    method,
    headers: { Authorization: `Bearer ${data?.session?.access_token || ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");

function Group({ title, note, rows, picked, setPicked }) {
  const open = rows.filter((r) => r.email && !r.linked);
  const allOn = open.length > 0 && open.every((r) => picked.has(r.id));
  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <section className="boxed stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 className="sub-title">{title}</h2>
          <p className="small">{note}</p>
        </div>
        {open.length ? (
          <label className="check">
            <input
              type="checkbox"
              checked={allOn}
              onChange={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  open.forEach((r) => (allOn ? n.delete(r.id) : n.add(r.id)));
                  return n;
                })
              }
            />
            Select everyone not signed up
          </label>
        ) : null}
      </div>
      <div className="list table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">Select</span></th>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Property</th>
              <th scope="col">Account</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.email && !r.linked ? (
                    <input type="checkbox" aria-label={`Invite ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                  ) : null}
                </td>
                <td className="addr">{r.name}</td>
                <td>{r.email || <span className="small">No email on file</span>}</td>
                <td className="small">{r.detail}</td>
                <td>
                  {r.linked ? (
                    <span className="pill st-available">Signed up</span>
                  ) : r.invited_at ? (
                    <span className="pill st-draft">Invited {shortDay(r.invited_at)}</span>
                  ) : (
                    <span className="small">Not invited</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PortalInvites() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [owners, setOwners] = useState(new Set());
  const [tenants, setTenants] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(() => api("GET").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const count = owners.size + tenants.size;
    if (!count) return;
    setBusy(true);
    setDone("");
    setError("");
    try {
      const r = await api("POST", { owners: [...owners], tenants: [...tenants] });
      setDone(`Sent ${r.sent} invitation${r.sent === 1 ? "" : "s"}.${r.skipped?.length ? ` Not sent: ${r.skipped.join(", ")}.` : ""}`);
      setOwners(new Set());
      setTenants(new Set());
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="warnbox">{error}</div>;
  if (!data) return <p className="small">Loading…</p>;
  const count = owners.size + tenants.size;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <p className="small">
        Each invitation explains what the portal does and has a button that opens the sign-in with their email filled in. Their
        account links to their owner or tenant record automatically when they sign in with that email. People who have already
        signed up can&apos;t be selected.
      </p>
      {error ? <div className="warnbox">{error}</div> : null}
      {done ? <div className="okbox" role="status">{done}</div> : null}
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn primary" disabled={!count || busy} onClick={send}>
          {busy ? "Sending…" : count ? `Send ${count} invitation${count === 1 ? "" : "s"}` : "Select people to invite"}
        </button>
      </div>
      <Group title="Owners" note="Owners with at least one active property." rows={data.owners} picked={owners} setPicked={setOwners} />
      <Group title="Tenants" note="Tenants on current and upcoming leases." rows={data.tenants} picked={tenants} setPicked={setTenants} />
    </div>
  );
}
