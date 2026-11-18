"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { monthLabel, shortDate } from "@/lib/rent";
import { kindLabel } from "@/lib/owner-requests";

async function bearer() {
  const { data } = await getBrowserClient().auth.getSession();
  return data?.session?.access_token || "";
}
const day = (ts) => shortDate(new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }));

// Staff: landlords' information requests from the owner portal. Answer, optionally email the reply, mark done.
export default function OwnerRequests() {
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("open");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getBrowserClient()
      .from("owner_requests")
      .select("id, kind, period, message, status, staff_reply, replied_by_email, created_at, done_at, owner:owners(id, name, email), property:properties(id, address)")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error: e }) => {
        setRows(data || []);
        setError(e ? "We couldn't load the requests. Refresh the page to try again." : "");
      });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const list = (rows || []).filter((r) => r.status === tab);
  const openCount = (rows || []).filter((r) => r.status === "open").length;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Landlords</span>
        <h1 className="admin-title">Owner Requests</h1>
        <p className="small">
          Information landlords asked for from their owner portal. Reply here; tick “Email the reply” to send it to the landlord&apos;s email on
          file. The reply also shows in their portal.
        </p>
      </div>
      <div className="seg">
        <button type="button" aria-pressed={tab === "open"} onClick={() => setTab("open")}>
          Open ({openCount})
        </button>
        <button type="button" aria-pressed={tab === "done"} onClick={() => setTab("done")}>
          Done
        </button>
      </div>
      {error ? <div className="warnbox">{error}</div> : null}
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !list.length ? (
        <p className="small">{tab === "open" ? "No open requests." : "Nothing answered yet."}</p>
      ) : (
        <div className="stack">
          {list.map((r) => (
            <RequestRow key={r.id} r={r} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestRow({ r, onSaved }) {
  const [reply, setReply] = useState(r.staff_reply || "");
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function save(status) {
    if (status === "done" && email && !window.confirm(`Email this reply to ${r.owner?.email}?`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/owner-requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await bearer()}` },
      body: JSON.stringify({ status, reply, email: status === "done" && email }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMsg(["err", json.error || "That didn't save. Try again."]);
    onSaved();
  }

  return (
    <section className="boxed stack">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
        <div>
          <strong>{kindLabel(r.kind)}</strong>
          {r.period ? ` · ${monthLabel(r.period)}` : ""}
          <span className="sub-line small">
            {r.owner?.id ? <Link href={`/admin/owners/${r.owner.id}`}>{r.owner.name}</Link> : "Landlord"}
            {r.owner?.email ? ` · ${r.owner.email}` : " · no email on file"} · {r.property?.address || "All properties"}
          </span>
        </div>
        <span className="small">
          Asked {day(r.created_at)}
          {r.done_at ? ` · Done ${day(r.done_at)}${r.replied_by_email ? " (emailed)" : ""}` : ""}
        </span>
      </div>
      {r.message ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.message}</p> : null}
      {r.status === "open" ? (
        <>
          <div className="field">
            <label htmlFor={`rep-${r.id}`}>Reply (shown in their portal)</label>
            <textarea id={`rep-${r.id}`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
          </div>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} disabled={!r.owner?.email} />
            Email the reply to the landlord
          </label>
          <div className="req-actions">
            <button type="button" className="btn primary sm" disabled={busy || (email && !reply.trim())} onClick={() => save("done")}>
              {busy ? "Saving…" : email ? "Email reply and mark done" : "Mark done"}
            </button>
          </div>
        </>
      ) : (
        <>
          {r.staff_reply ? (
            <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              <strong>Reply:</strong> {r.staff_reply}
            </p>
          ) : null}
          <div>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => save("open")}>
              Reopen
            </button>
          </div>
        </>
      )}
      {msg ? <div className={msg[0] === "err" ? "warnbox" : "okbox"}>{msg[1]}</div> : null}
    </section>
  );
}
