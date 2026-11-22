"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import { CHARGE_TO, PHOTO_BUCKET, SIGNED_PHOTO_SECONDS, isVideo } from "@/lib/maintenance";
import { shortDate } from "@/lib/rent";

const HST = 13;
const billedFor = (price, chargeTo) => (Number(price) > 0 ? (chargeTo === "irep" ? Number(price) : Math.round(Number(price) * (100 + HST)) / 100) : 0);
const COLS =
  "id, title, status, urgency, charge_to, owner_approval, estimated_cost, photos, vendor_done_at, vendor_done_on, vendor_notes, vendor_price, vendor_hst, partner:partners(name), unit:units(label, property:properties(address))";

function AfterPhotos({ photos }) {
  const after = (photos || []).filter((p) => p.stage === "after" && p.path);
  const [urls, setUrls] = useState({});
  const key = after.map((p) => p.path).join("|");
  useEffect(() => {
    if (!key) return;
    getBrowserClient()
      .storage.from(PHOTO_BUCKET)
      .createSignedUrls(key.split("|"), SIGNED_PHOTO_SECONDS)
      .then(({ data }) => setUrls(Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))));
  }, [key]);
  if (!after.length) return <span className="small">No after photos.</span>;
  return (
    <ul className="photo-grid">
      {after.map((p) => (
        <li key={p.path} className="maint-photo">
          {urls[p.path] ? (
            isVideo(p.name || p.path) ? (
              <video src={urls[p.path]} controls preload="metadata" />
            ) : (
              <a href={urls[p.path]} target="_blank" rel="noreferrer">
                <img src={urls[p.path]} alt={p.name || "After photo"} />
              </a>
            )
          ) : (
            <span className="small">Loading…</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Review({ r, onDone }) {
  const [chargeTo, setChargeTo] = useState(r.charge_to || "owner");
  const [cost, setCost] = useState(() => billedFor(r.vendor_price, r.charge_to || "owner").toFixed(2));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const needsOk = r.owner_approval === "pending" && Number(cost) > 250;
  async function approve() {
    if (!(Number(cost) >= 0)) return setMsg("Enter the amount to charge.");
    setBusy(true);
    const { error } = await getBrowserClient()
      .from("maintenance_requests")
      .update({
        status: "completed",
        completed_at: new Date(`${r.vendor_done_on}T12:00:00`).toISOString(),
        partner_pay: Number(r.vendor_price || 0),
        partner_hst: Boolean(r.vendor_hst),
        actual_cost: Number(cost),
        charge_to: chargeTo,
      })
      .eq("id", r.id);
    setBusy(false);
    if (error) return setMsg(/locked/i.test(error.message || "") ? "That month is locked. Unlock it or change the date." : "That didn't save. Try again.");
    refreshStaffCounts();
    onDone();
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="req-actions" style={{ flexWrap: "wrap" }}>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small">Charge to</span>
          <select
            value={chargeTo}
            onChange={(e) => {
              setChargeTo(e.target.value);
              setCost(billedFor(r.vendor_price, e.target.value).toFixed(2));
            }}
          >
            {Object.entries(CHARGE_TO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small">Amount charged{chargeTo === "irep" ? "" : " (his price + 13% HST)"}</span>
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} style={{ width: 120 }} />
        </label>
      </div>
      {needsOk ? <p className="small err">The landlord hasn&apos;t approved this yet and it&apos;s over $250. Get their OK first, unless it was an emergency.</p> : null}
      <div className="req-actions">
        <button type="button" className="btn primary sm" disabled={busy} onClick={approve}>
          Approve and Complete
        </button>
        <Link className="btn ghost sm" href={`/admin/maintenance/${r.id}`}>
          Open the Request
        </Link>
        {msg ? <span className="small">{msg}</span> : null}
      </div>
    </div>
  );
}

// Staff: jobs a partner (Chuck) marked done in the Agent Portal, to check and complete. Completing puts the charge
// on the landlord's statement (or the tenant's ledger) and his price on his pay.
export default function JobsDone() {
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    const { data } = await getBrowserClient().from("maintenance_requests").select(COLS).not("vendor_done_at", "is", null).neq("status", "completed").order("vendor_done_at");
    setRows(data || []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Maintenance</span>
        <h1 className="admin-title">Jobs Done</h1>
        <p className="small">Jobs Chuck marked done in the Agent Portal, with what he did, his price before HST and after photos. Check each one, then approve it.</p>
      </div>
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <p className="small">Nothing to review.</p>
      ) : (
        <ul className="req-list">
          {rows.map((r) => (
            <li key={r.id} className="req stack">
              <div className="req-top">
                <b>
                  {r.title} · {[r.unit?.property?.address, r.unit?.label].filter(Boolean).join(", ")}
                </b>
                <span className="small">
                  {r.partner?.name || "Partner"} · done {shortDate(r.vendor_done_on)}
                </span>
              </div>
              <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {r.vendor_notes}
              </p>
              <span className="small">
                His price: {Number(r.vendor_price) > 0 ? `$${Number(r.vendor_price).toFixed(2)} before HST${r.vendor_hst ? " (+ HST to him)" : ""}` : "no charge"}
                {r.estimated_cost ? ` · estimate was $${Number(r.estimated_cost).toFixed(2)}` : ""}
              </span>
              <AfterPhotos photos={r.photos} />
              <Review r={r} onDone={load} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
