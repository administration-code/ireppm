"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { cents, monthLabel, shortDate } from "@/lib/rent";
import { signedMoney } from "@/lib/payouts";
import { LETTER_SELECT, lastMonth, letterProperties, letterTotals } from "@/lib/letters";
import { sendLetters, sendSummary } from "@/lib/send-letters";

async function loadLetters(month) {
  const { data, error } = await getBrowserClient()
    .from("owner_letters")
    .select(`${LETTER_SELECT}, owner:owners(id, name, email)`)
    .eq("period", `${month}-01`);
  if (error) throw error;
  return (data || []).sort((a, b) => String(a.owner?.name).localeCompare(String(b.owner?.name)));
}

const sentDate = (l) =>
  l.sent_at ? shortDate(new Date(l.sent_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })) : "";

export default function LettersBoard({ initialMonth }) {
  const router = useRouter();
  const [month, setMonth] = useState(() => initialMonth || lastMonth());
  const [state, setState] = useState({ loading: true, letters: [], error: "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ ok: false, text: "" });

  const reload = useCallback(async () => {
    try {
      const letters = await loadLetters(month);
      setState({ loading: false, letters, error: "" });
    } catch {
      setState({ loading: false, letters: [], error: "We couldn't load letters. Refresh the page to try again." });
    }
  }, [month]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadLetters(month).then(
      (letters) => alive && setState({ loading: false, letters, error: "" }),
      () => alive && setState({ loading: false, letters: [], error: "We couldn't load letters. Refresh the page to try again." })
    );
    return () => {
      alive = false;
    };
  }, [month]);

  function changeMonth(value) {
    setMonth(value);
    setMsg({ ok: false, text: "" });
    if (/^\d{4}-\d{2}$/.test(value)) router.replace(`/admin/letters?month=${value}`, { scroll: false });
  }

  async function prepare() {
    setBusy("prepare");
    setMsg({ ok: false, text: "" });
    const { data, error } = await getBrowserClient().rpc("draft_owner_letters", { p_period: `${month}-01` });
    if (error) {
      setMsg({ ok: false, text: "We couldn't prepare the letters. Try again." });
    } else {
      setMsg({ ok: true, text: `Prepared ${data ?? 0} ${data === 1 ? "letter" : "letters"}. Letters already sent weren't changed.` });
      await reload();
    }
    setBusy("");
  }

  const drafts = state.letters.filter((l) => l.status === "draft");
  const withEmail = drafts.filter((l) => l.owner?.email);
  const noEmail = drafts.filter((l) => !l.owner?.email);

  async function sendAll() {
    const lines = [`Send ${withEmail.length} draft ${withEmail.length === 1 ? "letter" : "letters"} for ${monthLabel(`${month}-01`)}?`];
    if (noEmail.length) lines.push("", `No email on file (won't be sent): ${noEmail.map((l) => l.owner?.name || "Unknown").join(", ")}`);
    if (!window.confirm(lines.join("\n"))) return;
    setBusy("send");
    setMsg({ ok: false, text: "" });
    try {
      const result = await sendLetters(withEmail.map((l) => l.id));
      setMsg({ ok: !result.failed?.length, text: sendSummary(result) });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    await reload();
    setBusy("");
  }

  const { loading, letters, error } = state;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin">
          ← Staff inbox
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff</span>
            <h1 className="admin-title">Landlord letters</h1>
            <p className="small">
              Monthly statements for each owner. Prepare the drafts, check them over, then send. Landlords sign in to read them.
            </p>
          </div>
          <Link className="btn ghost sm" href={`/admin/payouts?month=${month}`}>
            Landlord payouts
          </Link>
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ flex: "0 1 220px" }}>
          <label htmlFor="letters-month">Month</label>
          <input id="letters-month" type="month" value={month} onChange={(e) => changeMonth(e.target.value)} />
        </div>
        <div className="req-actions" style={{ alignSelf: "end" }}>
          <button type="button" className="btn primary sm" onClick={prepare} disabled={Boolean(busy)}>
            {busy === "prepare" ? "Preparing…" : "Prepare letters"}
          </button>
          <button type="button" className="btn ghost sm" onClick={sendAll} disabled={Boolean(busy) || !withEmail.length}>
            {busy === "send" ? "Sending…" : `Send all drafts${withEmail.length ? ` (${withEmail.length})` : ""}`}
          </button>
        </div>
      </div>

      {msg.text ? (
        <div className={msg.ok ? "okbox" : "warnbox"} role="status">
          {msg.text}
        </div>
      ) : null}
      {error ? <div className="warnbox">{error}</div> : null}

      <section className="boxed stack" aria-labelledby="sec-letters">
        <h2 id="sec-letters" className="sec-title">
          {monthLabel(`${month}-01`)} letters
        </h2>
        {loading ? (
          <p className="small">Loading letters…</p>
        ) : !letters.length ? (
          <p className="small">No letters for this month yet. Choose “Prepare letters” to draft them.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col">Properties</th>
                  <th scope="col" className="r">
                    Net to you
                  </th>
                  <th scope="col" className="r">
                    Balance
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Owner email</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l) => {
                  const t = letterTotals(l);
                  const props = letterProperties(l);
                  return (
                    <tr key={l.id}>
                      <td className="addr">
                        <Link href={`/admin/letters/${l.id}`}>{l.owner?.name || l.data?.owner?.name || "Unknown owner"}</Link>
                      </td>
                      <td>{props.map((p) => p.address).join(", ") || "—"}</td>
                      <td className="r num">{money(t.net)}</td>
                      <td className={`r num${cents(t.balance) > 0 ? " to-pay" : ""}`}>{signedMoney(t.balance)}</td>
                      <td>
                        {l.status === "sent" ? (
                          <span className="pill cs-full">Sent {sentDate(l)}</span>
                        ) : (
                          <span className="pill opt">Draft</span>
                        )}
                      </td>
                      <td>{l.status === "sent" ? l.sent_to : l.owner?.email || <span className="small">No email on file</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
