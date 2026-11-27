"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import PhotoPicker, { uploadPhotos } from "@/components/admin/PhotoPicker";
import PriceInput from "./PriceInput";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const money = (n) => `$${Number(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

const CHOICES = [
  ["fixed", "Fixed It on Site", "Done. IRep bills it."],
  ["estimate", "Needs an Estimate", "Bigger job: the landlord OKs it first."],
  ["non_issue", "Not an Issue", "Nothing needs repairing."],
];

// One job in the Agent Portal. After a visit Chuck picks what happened:
//   Fixed It on Site → date, what he did, price, after photos (→ invoice)
//   Needs an Estimate → the work needed and his price before HST (→ landlord approval; the job stays open)
//   Not an Issue → what he found (→ IRep closes it, no invoice)
export default function AgentJobDone({ job, userId, done, estimate, onDone }) {
  const [mode, setMode] = useState(""); // "" | fixed | estimate | non_issue
  const [f, setF] = useState({ done_on: today(), notes: "", scope: "", price: "", no_charge: false, amount: "", mode: "before" });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (done) return <span className="sub-line small">Marked · waiting for IRep to review</span>;
  // Estimate sent: wait for the landlord's OK, then he can finish it.
  const waiting = estimate && estimate.approval !== "approved";
  if (waiting && !mode)
    return (
      <span className="sub-line small">
        Your estimate ({money(estimate.price)} before HST) is with IRep{estimate.sent ? " and the landlord" : ""}. Waiting for the landlord&apos;s OK: you&apos;ll get
        a notification when it&apos;s approved.
      </span>
    );

  if (!mode)
    return (
      <div className="stack" style={{ gap: 6, marginTop: 6 }}>
        {estimate?.approval === "approved" ? <span className="small">Landlord approved your estimate. When it&apos;s finished, tap Fixed It on Site.</span> : <span className="small">After your visit, what happened?</span>}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
          {CHOICES.filter(([k]) => !(estimate?.approval === "approved" && k === "estimate")).map(([k, label, hint]) => (
            <button key={k} type="button" className={`btn ${k === "fixed" ? "primary" : "ghost"} sm`} style={{ minHeight: 52, textAlign: "left", whiteSpace: "normal" }} onClick={() => { setErr(""); setMode(k); }}>
              <b>{label}</b>
              <br />
              <span className="small">{hint}</span>
            </button>
          ))}
        </div>
      </div>
    );

  async function save(e) {
    e.preventDefault();
    if (mode === "fixed") {
      if (f.notes.trim().length < 5) return setErr("Say what you did.");
      if (!f.no_charge && !(Number(f.price) > 0)) return setErr("Enter your price, or tap No charge.");
    }
    if (mode === "estimate") {
      if (f.scope.trim().length < 10) return setErr("Describe the work that's needed.");
      if (!(Number(f.price) > 0)) return setErr("Enter your estimate.");
    }
    if (mode === "non_issue" && f.notes.trim().length < 5) return setErr("Say what you found.");
    setBusy(true);
    setErr("");
    const sb = getBrowserClient();
    let photos = [];
    if (files.length) {
      const up = await uploadPhotos(sb, userId, files);
      if (up.error) {
        setBusy(false);
        return setErr(up.error);
      }
      photos = up.photos;
    }
    const body =
      mode === "estimate"
        ? { outcome: "estimate", id: job.id, scope: f.mode === "includes" ? `${f.scope}\n(Entered as $${f.amount} including HST.)` : f.scope, price: f.price, photos }
        : mode === "non_issue"
          ? { outcome: "non_issue", id: job.id, notes: f.notes, photos }
          : { id: job.id, done_on: f.done_on, notes: f.mode === "includes" ? `${f.notes}\n(Price entered as $${f.amount} including HST.)` : f.notes, price: f.price, no_charge: f.no_charge, photos };
    const res = await fetch("/api/agent/maintenance/done", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(out.error || "That didn't save. Try again.");
    setMode("");
    onDone(job.id, mode, Number(f.price) || 0);
  }

  const title = CHOICES.find(([k]) => k === mode)?.[1];
  return (
    <form className="stack" onSubmit={save} style={{ gap: 8, marginTop: 8 }}>
      <b>{title}</b>
      {mode === "fixed" ? (
        <>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">Date you finished</span>
            <input type="date" max={today()} value={f.done_on} onChange={(e) => setF((s) => ({ ...s, done_on: e.target.value }))} />
          </label>
          <textarea rows={3} placeholder="What you did (and any parts you used)" value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} />
          <PriceInput value={f} onChange={(v) => setF((s) => ({ ...s, ...v }))} />
          <PhotoPicker id={`done-${job.id}`} files={files} setFiles={setFiles} onError={setErr} label="After photos" hint="Take photos of the finished work. They help IRep bill the landlord." />
        </>
      ) : mode === "estimate" ? (
        <>
          <textarea
            rows={4}
            placeholder="The work that's needed, e.g. replace the lower unit's back door and frame, and about 120 sq ft of flooring in the kitchen"
            value={f.scope}
            onChange={(e) => setF((s) => ({ ...s, scope: e.target.value }))}
          />
          <PriceInput value={f} onChange={(v) => setF((s) => ({ ...s, ...v, ...(v.no_charge ? { mode: "before", no_charge: false } : {}) }))} />
          <PhotoPicker id={`est-${job.id}`} files={files} setFiles={setFiles} onError={setErr} label="Photos of the problem" hint="They help the landlord see why it's needed." />
          <span className="small">The job stays on your list. IRep sends your estimate to the landlord, and you&apos;ll get a notification when it&apos;s approved.</span>
        </>
      ) : (
        <>
          <textarea rows={3} placeholder="What you found, e.g. the tap works fine, the noise is the pipes in the wall" value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} />
          <PhotoPicker id={`ni-${job.id}`} files={files} setFiles={setFiles} onError={setErr} label="Photos (optional)" hint="A photo showing it's fine helps if the tenant asks." />
        </>
      )}
      {err ? <p className="small err">{err}</p> : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : mode === "estimate" ? "Send Estimate to IRep" : "Send to IRep"}
        </button>
        <button type="button" className="link-btn small" onClick={() => setMode("")}>
          Back
        </button>
      </div>
    </form>
  );
}
