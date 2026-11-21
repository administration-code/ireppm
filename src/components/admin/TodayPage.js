"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

// Staff: the start-of-day list. Short plain lines (one page), with Copy as Text for an assistant or email.
export default function TodayPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await getBrowserClient().auth.getSession();
      const res = await fetch("/api/admin/today?summary=1", { headers: { Authorization: `Bearer ${s?.session?.access_token || ""}` } }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) return setError(json.error || "We couldn't load today's list.");
      setData(json);
    })();
  }, []);

  async function copy() {
    const text = [data.summary ? `${data.summary}\n` : "", data.text].join("\n").trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying didn't work in this browser. Select the text and copy it instead.");
    }
  }

  if (error) return <div className="warnbox">{error}</div>;
  if (!data) return <p className="small">Building today&apos;s list…</p>;

  return (
    <div className="stack today" style={{ gap: 14, maxWidth: 820 }}>
      <div className="req-top">
        <h1 className="admin-title" style={{ fontSize: "1.8rem" }}>
          {data.head.replace("IRep Today: ", "Today, ")}
        </h1>
        <button type="button" className="btn ghost sm" onClick={copy}>
          {copied ? "Copied" : "Copy as Text"}
        </button>
      </div>
      {data.summary ? <p className="today-summary">{data.summary}</p> : null}
      {data.sections.map((s) => (
        <section key={s.title} className="today-sec">
          <h2>{s.title}</h2>
          {s.lines.length ? (
            <ul>
              {s.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="small">None.</p>
          )}
        </section>
      ))}
      <p className="small">Also emailed to administration@ireppm.ca on weekday mornings.</p>
    </div>
  );
}
