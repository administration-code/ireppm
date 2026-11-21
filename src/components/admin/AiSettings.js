"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";

const FEATURE = { ask_irep: "Ask IRep", today_summary: "Today summary", classify_email: "Email category" };

// Staff: the AI on/off switch, monthly cap and prices, this month's spend, the usage log and the
// log of everything the assistant created.
export default function AiSettings() {
  const [s, setS] = useState(null);
  const [usage, setUsage] = useState([]);
  const [actions, setActions] = useState([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const sb = getBrowserClient();
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const [a, b, c] = await Promise.all([
      sb.from("ai_settings").select("*").maybeSingle(),
      sb.from("ai_usage").select("*").gte("at", new Date(Date.now() - 62 * 86400000).toISOString()).order("at", { ascending: false }).limit(300),
      sb.from("ai_actions").select("at, tool, input, result").order("at", { ascending: false }).limit(100),
    ]);
    setS(a.data);
    setUsage(b.data || []);
    setActions(c.data || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    const { data: u } = await getBrowserClient().auth.getUser();
    const { error } = await getBrowserClient()
      .from("ai_settings")
      .update({
        enabled: s.enabled,
        monthly_cap_usd: Number(s.monthly_cap_usd),
        haiku_in: Number(s.haiku_in),
        haiku_out: Number(s.haiku_out),
        sonnet_in: Number(s.sonnet_in),
        sonnet_out: Number(s.sonnet_out),
        updated_by: u?.user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setMsg(error ? error.message : "Saved.");
  }

  if (!s) return <p className="small">Loading…</p>;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const thisMonth = usage.filter((u) => new Date(u.at) >= monthStart);
  const spent = thisMonth.reduce((t, u) => t + Number(u.cost_usd), 0);
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Assistant</span>
        <h1 className="admin-title">AI Settings and Usage</h1>
        <p className="small">
          This month: <b>${spent.toFixed(2)}</b> of the ${Number(s.monthly_cap_usd).toFixed(2)} cap, {thisMonth.length} requests. Requests stop once
          the cap is reached.
        </p>
      </div>
      <form className="boxed stack" onSubmit={save}>
        <label className="check-line">
          <input type="checkbox" checked={s.enabled} onChange={set("enabled")} />
          AI assistant on
        </label>
        <div className="row3">
          <div className="field">
            <label htmlFor="ai-cap">Monthly cap (US$)</label>
            <input id="ai-cap" inputMode="decimal" value={s.monthly_cap_usd} onChange={set("monthly_cap_usd")} />
          </div>
        </div>
        <p className="small" style={{ margin: 0 }}>Prices per million tokens (US$), used to estimate cost. Check them against Anthropic&apos;s current pricing.</p>
        <div className="row4">
          {[
            ["haiku_in", "Haiku input"],
            ["haiku_out", "Haiku output"],
            ["sonnet_in", "Sonnet input"],
            ["sonnet_out", "Sonnet output"],
          ].map(([k, l]) => (
            <div key={k} className="field">
              <label htmlFor={`ai-${k}`}>{l}</label>
              <input id={`ai-${k}`} inputMode="decimal" value={s[k]} onChange={set(k)} />
            </div>
          ))}
        </div>
        <div>
          <button type="submit" className="btn primary sm">
            Save Settings
          </button>
        </div>
        {msg ? <div className="okbox">{msg}</div> : null}
      </form>
      <section className="stack">
        <h2 className="sec-title">Usage (last 2 months)</h2>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Model</th>
                <th scope="col" className="r">Tokens in / cached / out</th>
                <th scope="col" className="r">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.id}>
                  <td>{shortDate(String(u.at).slice(0, 10))} {new Date(u.at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</td>
                  <td>
                    {FEATURE[u.feature] || u.feature}
                    {!u.ok ? <span className="sub-line small err">{u.error}</span> : null}
                  </td>
                  <td className="small">{u.model}</td>
                  <td className="r num">
                    {u.input_tokens} / {u.cache_read_tokens} / {u.output_tokens}
                  </td>
                  <td className="r num">${Number(u.cost_usd).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="stack">
        <h2 className="sec-title">What the Assistant Did</h2>
        <ul className="plain-list stack small" style={{ gap: 4 }}>
          {actions.map((a, i) => (
            <li key={i}>
              {shortDate(String(a.at).slice(0, 10))} · <b>{a.tool}</b>
              {a.result?.link ? ` → ${a.result.link}` : ""}
              {a.result?.error ? ` (error: ${a.result.error})` : ""}
            </li>
          ))}
          {!actions.length ? <li>Nothing yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
