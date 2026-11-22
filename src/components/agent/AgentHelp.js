"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { HELP_TOPICS } from "@/lib/chuck-help";

// Chuck's helper: big buttons for the usual jobs (three steps and a button that takes him there), and a box to ask.
export default function AgentHelp() {
  const [open, setOpen] = useState("");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(e) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    setAnswer("");
    const { data } = await getBrowserClient().auth.getSession();
    const res = await fetch("/api/agent/help", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
      body: JSON.stringify({ question: q }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    setAnswer(out.answer || out.error || "Ask Rosie: email administration@ireppm.ca.");
  }

  const topic = HELP_TOPICS.find((t) => t.key === open);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">
          <Link href="/agent">Agent Portal</Link>
        </span>
        <h1 className="admin-title">What Do You Need to Do?</h1>
        <p className="small">Tap what you&apos;re doing. You&apos;ll get the steps and a button that takes you there.</p>
      </div>

      {topic ? (
        <section className="boxed stack attention" style={{ gap: 12 }}>
          <h2 className="sec-title">{topic.q}</h2>
          <ol className="stack" style={{ gap: 8, paddingLeft: 22, margin: 0, fontSize: "1.05rem" }}>
            {topic.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="req-actions">
            <Link className="btn primary" href={topic.href}>
              Take Me to {topic.go}
            </Link>
            <button type="button" className="btn ghost" onClick={() => setOpen("")}>
              Back
            </button>
          </div>
        </section>
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {HELP_TOPICS.map((t) => (
            <button key={t.key} type="button" className="btn ghost" style={{ padding: "16px 14px", textAlign: "left", whiteSpace: "normal", fontSize: "1.02rem" }} onClick={() => setOpen(t.key)}>
              {t.q}
            </button>
          ))}
        </div>
      )}

      <form className="boxed stack" onSubmit={ask} style={{ gap: 10 }}>
        <h2 className="sec-title">Not on the List? Ask</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: how do I add photos to a job?" />
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy || q.trim().length < 3}>
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
        {answer ? (
          <div className="okbox" role="status" style={{ whiteSpace: "pre-wrap" }}>
            {answer}
          </div>
        ) : null}
      </form>

      <p className="small">
        Still stuck? Email <a href="mailto:administration@ireppm.ca">administration@ireppm.ca</a> or call the office at{" "}
        <a href="tel:5195907200">519-590-7200</a>.
      </p>
    </div>
  );
}
