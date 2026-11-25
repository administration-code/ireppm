"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { uploadPhotos } from "@/components/admin/PhotoPicker";
import { PHOTO_ACCEPT } from "@/lib/maintenance";
import { shortDate } from "@/lib/rent";
import { money } from "@/lib/format";

const KIND = { lawn: "Lawn", snow: "Snow" };

async function call(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/visits", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const lastText = (l) => (l ? `${shortDate(l.on)}${l.on === today() ? " (today)" : ""}${l.photos ? "" : " · no photo"}` : "Never");

// Chuck: lawn and snow, by contract. Included properties first, then the ones billed per visit.
// Each property shows its last lawn and snow visit; Log Lawn / Log Snow opens a photo + Save right there.
export default function AgentVisits() {
  const { user, ready } = useAuth();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null); // { id, kind }
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState("");
  const [charge, setCharge] = useState({ mode: "standard", amount: "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "", id: null });

  const load = useCallback(async () => setD(await call("GET")), []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  function start(p, kind, requestId = null) {
    setCharge({ mode: "standard", amount: "" });
    setOpen(open?.id === p.id && open?.kind === kind && !requestId ? null : { id: p.id, kind, requestId });
    setFiles([]);
    setNote("");
    setMsg({ kind: "", text: "", id: null });
  }

  async function save(p) {
    let photos = [];
    if (files.length) {
      setBusy(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
      const out = await uploadPhotos(getBrowserClient(), user.id, files);
      if (out.error) {
        setBusy("");
        return setMsg({ kind: "err", text: out.error, id: p.id });
      }
      photos = out.photos;
    }
    setBusy("Saving…");
    const chargeAmount = p.included ? undefined : charge.mode === "other" ? charge.amount : p.fee.amount;
    if (!p.included && !(Number(String(chargeAmount).replace(/[$,\s]/g, "")) >= 0) ) {
      setBusy("");
      return setMsg({ kind: "err", text: "Enter the amount charged to the landlord.", id: p.id });
    }
    const out = await call("POST", { property_id: p.id, kind: open.kind, photos, note, charge_amount: chargeAmount, request_id: open.requestId || undefined });
    setBusy("");
    if (out.error) return setMsg({ kind: "err", text: out.error, id: p.id });
    setMsg({ kind: "ok", text: `✓ ${KIND[open.kind]} visit logged.${p.included ? "" : " The landlord gets an email with the charge."}`, id: p.id });
    setOpen(null);
    setFiles([]);
    setNote("");
    load();
  }

  async function remove(p, v) {
    await call("POST", { action: "delete", id: v.id });
    setMsg({ kind: "ok", text: "Removed.", id: p.id });
    load();
  }

  if (!ready || (user && !d)) return <p className="small">Loading…</p>;
  if (!user) return <p>Sign in to your Agent Portal first.</p>;

  const row = (p) => {
    const isOpen = open?.id === p.id;
    const todays = p.recent.filter((v) => v.on === today());
    return (
      <li key={p.id} className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <div>
          <b>{p.address}</b>
          <span className="small sub-line">
            {p.fee.amount != null ? `${money(p.fee.amount)} + HST ${p.fee.per === "month" ? "a month" : "per visit"} · ` : ""}
            {p.fee.label}
          </span>
        </div>
        {p.requests?.length ? (
          <div className="warnbox stack" style={{ gap: 6 }}>
            {p.requests.map((r) => (
              <span key={r.id}>
                <b>Landlord asked for {KIND[r.kind].toLowerCase()}</b> on {shortDate(r.on)}
                {r.note ? `: "${r.note}"` : ""}.{" "}
                <button type="button" className="btn primary sm" style={{ minHeight: 40 }} onClick={() => start(p, r.kind, r.id)}>
                  Log It Done
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {p.lawnDue ? (
          <span className="small" style={p.lawnDue.overdue ? { color: "#8a110c", fontWeight: 600 } : p.lawnDue.days <= 7 ? { fontWeight: 600 } : undefined}>
            {p.lawnDue.overdue
              ? `Lawn cut overdue: was due ${shortDate(p.lawnDue.due)} (every 40 days)`
              : `Next lawn cut due by ${shortDate(p.lawnDue.due)} (${p.lawnDue.days} day${p.lawnDue.days === 1 ? "" : "s"})`}
          </span>
        ) : null}
        <span className="small">{p.snowNote}</span>
        <div className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 10, rowGap: 2 }}>
          <span>Last lawn:</span>
          <b>{lastText(p.lastLawn)}</b>
          <span>Last snow:</span>
          <b>{lastText(p.lastSnow)}</b>
        </div>
        <div className="req-actions">
          {Object.entries(KIND).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={isOpen && open.kind === k}
              className={`btn ${isOpen && open.kind === k ? "primary" : "ghost"}`}
              style={{ minHeight: 48, minWidth: 120 }}
              onClick={() => start(p, k)}
            >
              Log {l}
            </button>
          ))}
        </div>
        {isOpen ? (
          <div className="stack" style={{ gap: 8, background: "var(--ivory, #F7F4EE)", borderRadius: 8, padding: 12 }}>
            <span className="small">
              {KIND[open.kind]} visit today{p.included ? " (included in their plan)" : ` (${money(p.fee.amount)} + HST, billed to the landlord)`}
            </span>
            <label className="btn ghost" style={{ minHeight: 48, width: "fit-content", display: "inline-flex", alignItems: "center", background: "#fff" }}>
              {files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} added` : "Take or Add a Photo"}
              <input type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 6))} />
            </label>
            <input aria-label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): salted the steps too" />
            {p.included ? null : (
              <div className="stack" style={{ gap: 6 }}>
                <span className="small">Charge to the landlord</span>
                <div className="req-actions" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    aria-pressed={charge.mode === "standard"}
                    className={`btn ${charge.mode === "standard" ? "primary" : "ghost"} sm`}
                    style={{ minHeight: 44 }}
                    onClick={() => setCharge({ mode: "standard", amount: "" })}
                  >
                    {charge.mode === "standard" ? "✓ " : ""}
                    {money(p.fee.amount)} + HST
                  </button>
                  <button
                    type="button"
                    aria-pressed={charge.mode === "other"}
                    className={`btn ${charge.mode === "other" ? "primary" : "ghost"} sm`}
                    style={{ minHeight: 44 }}
                    onClick={() => setCharge({ mode: "other", amount: "" })}
                  >
                    {charge.mode === "other" ? "✓ " : ""}A Different Amount
                  </button>
                </div>
                {charge.mode === "other" ? (
                  <input inputMode="decimal" aria-label="Amount before HST" placeholder="Amount before HST" value={charge.amount} onChange={(e) => setCharge({ mode: "other", amount: e.target.value.replace(/[^\d.]/g, "") })} style={{ maxWidth: 200, minHeight: 48 }} />
                ) : null}
                <span className="small">
                  Landlord pays {money(Number(charge.mode === "other" ? charge.amount || 0 : p.fee.amount))} + HST ={" "}
                  {money(Math.round(Number(charge.mode === "other" ? charge.amount || 0 : p.fee.amount) * 113) / 100)}. They get an email when you save.
                </span>
              </div>
            )}
            <button type="button" className="btn primary" style={{ minHeight: 52 }} disabled={Boolean(busy)} onClick={() => save(p)}>
              {busy || (files.length ? "Save Visit" : "Save Without a Photo")}
            </button>
          </div>
        ) : null}
        {msg.id === p.id && msg.text ? (
          <span className={`small${msg.kind === "err" ? " err" : ""}`} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text}
          </span>
        ) : null}
        {todays.length ? (
          <span className="small">
            Logged today: {todays.map((v) => KIND[v.kind]).join(", ")}.{" "}
            <button type="button" className="link-btn small" onClick={() => remove(p, todays[0])}>
              Remove the last one
            </button>
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link href="/agent" className="small">
          ← Agent Portal
        </Link>
        <h1 className="admin-title">Lawn and Snow</h1>
        <p className="small" style={{ margin: 0 }}>
          Log each visit right after you finish. Add a photo: it&apos;s your proof if anyone says it wasn&apos;t done.
        </p>
      </div>
      {d.ready === false ? <div className="warnbox">Logging visits isn&apos;t switched on yet. Tell Rosie.</div> : null}

      <section className="boxed stack" aria-labelledby="ls-inc">
        <h2 id="ls-inc" className="sec-title">
          Included in Their Plan ({d.included.length})
        </h2>
        <p className="small" style={{ margin: 0 }}>
          These landlords pay for lawn and snow every month. Cut each lawn at least every 40 days in season (Apr 15 to Oct 31). Snow is as
          needed: tenants call you to arrange it.
        </p>
        {d.included.length ? <ul className="plain-list stack" style={{ gap: 12 }}>{d.included.map(row)}</ul> : <p className="small">None yet.</p>}
      </section>

      <section className="boxed stack" aria-labelledby="ls-alc">
        <h2 id="ls-alc" className="sec-title">
          Not on a Plan: Per Visit ({d.alaCarte.length})
        </h2>
        <p className="small" style={{ margin: 0 }}>
          Only when the landlord (or IRep) asks: their requests show up here. Each visit is billed at {money(d.rates.visit)} + HST, more for large
          lots (shown on each). Snow is the tenant&apos;s or landlord&apos;s job here unless the city issues a notice.
        </p>
        {d.alaCarte.length ? <ul className="plain-list stack" style={{ gap: 12 }}>{d.alaCarte.map(row)}</ul> : <p className="small">None.</p>}
      </section>
    </div>
  );
}
