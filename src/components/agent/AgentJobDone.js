"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import PhotoPicker, { uploadPhotos } from "@/components/admin/PhotoPicker";
import PriceInput from "./PriceInput";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

// One job in the Agent Portal: "Job Done" with the date, what he did, his price before HST and after photos.
export default function AgentJobDone({ job, userId, done, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ done_on: today(), notes: "", price: "", no_charge: false, amount: "", mode: "before" });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (done) return <span className="sub-line small">Marked done · waiting for IRep to review</span>;
  if (!open)
    return (
      <div className="req-actions" style={{ marginTop: 6 }}>
        <button type="button" className="btn primary sm" onClick={() => setOpen(true)}>
          Job Done
        </button>
      </div>
    );

  async function save(e) {
    e.preventDefault();
    if (f.notes.trim().length < 5) return setErr("Say what you did.");
    if (!f.no_charge && !(Number(f.price) > 0)) return setErr("Enter your price, or tap No charge.");
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
    const res = await fetch("/api/agent/maintenance/done", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({
        id: job.id,
        done_on: f.done_on,
        notes: f.mode === "includes" ? `${f.notes}\n(Price entered as $${f.amount} including HST.)` : f.notes,
        price: f.price,
        no_charge: f.no_charge,
        photos,
      }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(out.error || "That didn't save. Try again.");
    setOpen(false);
    onDone(job.id);
  }

  return (
    <form className="stack" onSubmit={save} style={{ gap: 8, marginTop: 8 }}>
      <label className="stack" style={{ gap: 4 }}>
        <span className="small">Date you finished</span>
        <input type="date" max={today()} value={f.done_on} onChange={(e) => setF((s) => ({ ...s, done_on: e.target.value }))} />
      </label>
      <textarea rows={3} placeholder="What you did (and any parts you used)" value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} />
      <PriceInput value={f} onChange={(v) => setF((s) => ({ ...s, ...v }))} />
      <PhotoPicker id={`done-${job.id}`} files={files} setFiles={setFiles} onError={setErr} label="After photos" hint="Take photos of the finished work. They help IRep bill the landlord." />
      {err ? <p className="small err">{err}</p> : null}
      <div className="req-actions">
        <button type="submit" className="btn primary sm" disabled={busy}>
          {busy ? "Saving…" : "Send to IRep"}
        </button>
        <button type="button" className="link-btn small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
