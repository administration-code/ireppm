"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";

const EXAMPLES = [
  "Who is in arrears and does anyone need an N4?",
  "Draft a reminder to the tenants at 634 Tournier about this month's rent.",
  "What's waiting on landlords right now?",
];

// Staff: ask the assistant, or have it draft an email, task or N4 details. It never sends anything.
export default function AskIRep() {
  const params = useSearchParams();
  const tenancyId = params.get("tenancy") || "";
  const [q, setQ] = useState(params.get("q") || (tenancyId ? "Draft " : ""));
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [error, setError] = useState("");

  async function ask(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    const { data } = await getBrowserClient().auth.getSession();
    const res = await fetch("/api/admin/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify({ question: q, tenancy_id: tenancyId || undefined }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(json.error || "That didn't work. Try again.");
    setOut(json);
  }

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Assistant</span>
        <h1 className="admin-title">Ask IRep</h1>
        <p className="small">
          Ask about tenants, rent or landlords, or ask for a draft. The assistant only makes drafts and tasks for you to review: it never sends,
          signs, pays or deletes anything.{tenancyId ? " It's looking at the tenancy you came from." : ""}
        </p>
      </div>
      <form className="stack" onSubmit={ask}>
        <div className="field">
          <label htmlFor="ask-q" className="visually-hidden">
            Your question
          </label>
          <textarea id="ask-q" rows={4} value={q} onChange={(e) => setQ(e.target.value)} placeholder={EXAMPLES[0]} />
        </div>
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Thinking…" : tenancyId ? "Draft with AI" : "Ask"}
          </button>
          {!q
            ? EXAMPLES.map((x) => (
                <button key={x} type="button" className="link-btn small" onClick={() => setQ(x)}>
                  {x}
                </button>
              ))
            : null}
        </div>
      </form>
      {error ? <div className="warnbox">{error}</div> : null}
      {out ? (
        <section className="boxed stack">
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{out.answer}</p>
          {out.created?.length ? (
            <div className="stack" style={{ gap: 4 }}>
              <b className="small">Created for you to review:</b>
              {out.created.map((c, i) => (
                <Link key={i} href={c.link}>
                  {c.tool === "draft_email" ? "Email draft" : c.tool === "draft_n4_details" ? "N4 task" : c.tool === "create_task" ? "Task" : "Note"} →
                </Link>
              ))}
            </div>
          ) : null}
          <span className="small">About ${Number(out.cost || 0).toFixed(3)} for this answer.</span>
        </section>
      ) : null}
    </div>
  );
}
