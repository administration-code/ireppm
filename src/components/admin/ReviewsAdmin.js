"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

async function api(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/admin/reviews", {
    method,
    headers: { Authorization: `Bearer ${data?.session?.access_token || ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

const STATUS = { pending: "To approve", approved: "On the website", hidden: "Hidden" };

export default function ReviewsAdmin() {
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("pending");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [replies, setReplies] = useState({});

  const load = useCallback(() => api("GET").then((r) => setRows(r.reviews)).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(id, action, extra = {}) {
    setBusy(id + action);
    setError("");
    try {
      await api("POST", { id, action, ...extra });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (!rows) return error ? <div className="warnbox">{error}</div> : <p className="small">Loading…</p>;
  const shown = rows.filter((r) => r.status === tab);
  const count = (s) => rows.filter((r) => r.status === s).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {Object.entries(STATUS).map(([k, l]) => (
          <button key={k} type="button" className={`btn sm ${tab === k ? "primary" : "ghost"}`} onClick={() => setTab(k)} aria-pressed={tab === k}>
            {l} ({count(k)})
          </button>
        ))}
        <a className="small" href="/reviews" target="_blank" rel="noopener noreferrer" style={{ alignSelf: "center" }}>Open the reviews page</a>
      </div>
      {error ? <div className="warnbox">{error}</div> : null}
      {shown.length ? (
        shown.map((r) => (
          <article key={r.id} className="boxed stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span>
                <span className="stars">{"★".repeat(r.rating)}<span className="off">{"★".repeat(5 - r.rating)}</span></span>{" "}
                <b>{r.display_name}</b> · {r.reviewer_type === "tenant" ? "Tenant" : "Landlord"}
                {r.verified ? <span className="pill st-available" style={{ marginLeft: 6 }}>Verified</span> : <span className="pill" style={{ marginLeft: 6 }}>Not verified</span>}
              </span>
              <span className="small">{new Date(r.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}{r.email ? ` · ${r.email}` : ""}</span>
            </div>
            {r.places?.length ? <p className="small" style={{ margin: 0 }}>{r.places.join(" · ")} (staff only, not shown on the website)</p> : null}
            {r.title ? <b>{r.title}</b> : null}
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.body}</p>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`reply-${r.id}`}>Public reply (optional)</label>
              <textarea
                id={`reply-${r.id}`}
                rows={2}
                maxLength={1000}
                value={replies[r.id] ?? r.staff_reply ?? ""}
                onChange={(e) => setReplies((x) => ({ ...x, [r.id]: e.target.value }))}
              />
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {r.status !== "approved" ? (
                <button type="button" className="btn primary sm" disabled={Boolean(busy)} onClick={() => act(r.id, "approve")}>Approve and publish</button>
              ) : (
                <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => act(r.id, "pending")}>Take down</button>
              )}
              {(replies[r.id] ?? r.staff_reply ?? "") !== (r.staff_reply ?? "") ? (
                <button type="button" className="btn ghost sm" disabled={Boolean(busy)} onClick={() => act(r.id, "reply", { reply: replies[r.id] })}>Save reply</button>
              ) : null}
              {r.status !== "hidden" ? (
                <button type="button" className="link-btn small" disabled={Boolean(busy)} onClick={() => act(r.id, "hide")}>Hide (spam or not genuine)</button>
              ) : (
                <button type="button" className="link-btn small" disabled={Boolean(busy)} onClick={() => act(r.id, "delete")}>Delete for good</button>
              )}
            </div>
          </article>
        ))
      ) : (
        <p className="small">Nothing here.</p>
      )}
    </div>
  );
}
