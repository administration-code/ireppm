"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";
import {
  CATEGORIES,
  MAX_PHOTOS,
  MAX_PHOTO_MB,
  PHOTO_ACCEPT,
  PHOTO_BUCKET,
  URGENCY_HELP,
  prettyDay,
  randomId,
  safeFileName,
  tenantStatus,
} from "@/lib/maintenance";

const MY_FIELDS = "id, tenancy_id, unit_id, title, status, scheduled_for, tenant_update, created_at";

const homeLabel = (h) => [h.address, h.unit_label].filter(Boolean).join(", ");

export default function MyHome({ user }) {
  const [state, setState] = useState({ loading: true, homes: [], requests: [] });
  const [reporting, setReporting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const sb = getBrowserClient();
    const [h, r] = await Promise.all([
      sb.from("my_homes").select("tenancy_id, unit_id, unit_label, address, city, postal_code"),
      sb.from("my_maintenance").select(MY_FIELDS).order("created_at", { ascending: false }),
    ]);
    setState({ loading: false, homes: h.data || [], requests: r.data || [] });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { loading, homes, requests } = state;
  if (loading || homes.length === 0) return null;

  return (
    <section className="boxed stack" aria-labelledby="my-home-title" style={{ gap: 16 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="eyebrow">My home</span>
          <h2 id="my-home-title">{homes.length === 1 ? homeLabel(homes[0]) : "Your homes"}</h2>
          {homes.length === 1 ? (
            <p className="small">{[homes[0].city, homes[0].postal_code].filter(Boolean).join(" ")}</p>
          ) : (
            <ul className="plain-list">
              {homes.map((h) => (
                <li key={h.tenancy_id}>{homeLabel(h)}</li>
              ))}
            </ul>
          )}
        </div>
        {!reporting ? (
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setMsg("");
              setReporting(true);
            }}
          >
            Report a problem
          </button>
        ) : null}
      </div>

      {msg ? (
        <div className="okbox" role="status">
          {msg}
        </div>
      ) : null}

      {reporting ? (
        <ReportForm
          user={user}
          homes={homes}
          onCancel={() => setReporting(false)}
          onSent={async () => {
            setReporting(false);
            setMsg("Thanks. We've received your request and will be in touch.");
            await load();
          }}
        />
      ) : null}

      <div className="stack" style={{ gap: 10 }}>
        <h3>My requests</h3>
        {requests.length ? (
          <div className="list">
            {requests.map((r) => (
              <div className="it" key={r.id}>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <b>{r.title}</b>
                  <span className="small">Sent {prettyDay(r.created_at)}</span>
                  {r.tenant_update ? <p className="req-note">{r.tenant_update}</p> : null}
                </div>
                <span className={`pill ms-${r.status}`}>{tenantStatus(r)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="small">No maintenance requests yet.</p>
        )}
      </div>
    </section>
  );
}

function ReportForm({ user, homes, onCancel, onSent }) {
  const [f, setF] = useState({
    tenancy_id: homes[0].tenancy_id,
    category: "",
    title: "",
    description: "",
    urgency: "routine",
    permission_to_enter: false,
    access_notes: "",
  });
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function addFiles(list) {
    setError("");
    const picked = Array.from(list || []);
    const tooBig = picked.find((file) => file.size > MAX_PHOTO_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is over ${MAX_PHOTO_MB} MB. Try a shorter video or a smaller photo.`);
    const next = [...files, ...picked];
    if (next.length > MAX_PHOTOS) setError(`You can add up to ${MAX_PHOTOS} photos or videos.`);
    setFiles(next.slice(0, MAX_PHOTOS));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!f.category) return setError("Choose what the problem is about.");
    if (!f.title.trim()) return setError("Add a short title, like “Kitchen tap is leaking”.");
    if (!f.description.trim()) return setError("Describe the problem so we know what to bring.");
    const home = homes.find((h) => h.tenancy_id === f.tenancy_id) || homes[0];

    setSending(true);
    const sb = getBrowserClient();
    const photos = [];
    for (const file of files) {
      const path = `${user.id}/${randomId()}/${safeFileName(file.name)}`;
      const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (up.error) {
        if (photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.path));
        setSending(false);
        return setError(`We couldn't upload ${file.name}. Check your connection and try again.`);
      }
      photos.push({ path, name: file.name });
    }

    // Tenants can't read maintenance_requests directly, so no .select() here.
    const { error: err } = await sb.from("maintenance_requests").insert({
      unit_id: home.unit_id,
      tenancy_id: home.tenancy_id,
      submitted_by: user.id,
      source: "tenant_portal",
      category: f.category,
      title: f.title.trim(),
      description: f.description.trim(),
      urgency: f.urgency,
      permission_to_enter: f.permission_to_enter,
      access_notes: f.access_notes.trim() || null,
      photos,
    });
    if (err) {
      if (photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.path));
      setSending(false);
      return setError("We couldn't send your request. Try again, or call us if it can't wait.");
    }
    setSending(false);
    onSent();
  }

  return (
    <form className="stack confirm-box" onSubmit={submit} noValidate aria-label="Report a problem">
      <h3>Report a problem</h3>
      {homes.length > 1 ? (
        <div className="field">
          <label htmlFor="m-home">Home</label>
          <select id="m-home" value={f.tenancy_id} onChange={set("tenancy_id")}>
            {homes.map((h) => (
              <option key={h.tenancy_id} value={h.tenancy_id}>
                {homeLabel(h)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="row2">
        <div className="field">
          <label htmlFor="m-cat">What is it about?</label>
          <select id="m-cat" value={f.category} onChange={set("category")} required>
            <option value="">Choose one</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="m-title">Short title</label>
          <input id="m-title" value={f.title} maxLength={120} onChange={set("title")} placeholder="Kitchen tap is leaking" required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="m-desc">Describe the problem</label>
        <textarea id="m-desc" value={f.description} onChange={set("description")} placeholder="What's happening, where, and since when?" required />
      </div>

      <div className="emergency-box" role="note">
        <b>Emergency?</b> No heat, flooding, no power or a sewer backup: call us right away at{" "}
        <a href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>{SITE.phone}</a>. If you smell gas or there&apos;s a fire, leave
        and call 911.
      </div>

      <fieldset className="field">
        <legend>How urgent is it?</legend>
        <div className="stack" style={{ gap: 8 }}>
          {Object.entries(URGENCY_HELP).map(([k, v]) => (
            <label className="check" key={k}>
              <input type="radio" name="m-urgency" value={k} checked={f.urgency === k} onChange={set("urgency")} />
              <span>{v}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={f.permission_to_enter} onChange={set("permission_to_enter")} />
        <span>You may enter if I&apos;m not home</span>
      </label>
      <div className="field">
        <label htmlFor="m-access">Access notes</label>
        <textarea
          id="m-access"
          value={f.access_notes}
          onChange={set("access_notes")}
          placeholder="Best times to come by, entry instructions, anything we should know"
          style={{ minHeight: 72 }}
        />
      </div>

      <div className="field">
        <span className="label-text">
          Photos or videos <span className="small">(optional, up to {MAX_PHOTOS})</span>
        </span>
        {files.length ? (
          <ul className="plain-list">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="file-row">
                <span>{file.name}</span>
                <button type="button" className="btn ghost sm" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                  Remove<span className="visually-hidden"> {file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {files.length < MAX_PHOTOS ? (
          <div>
            <label className="btn ghost sm" htmlFor="m-files">
              Add photos or videos
            </label>
            <input
              id="m-files"
              className="visually-hidden"
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={sending}>
          {sending ? "Sending…" : "Send request"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
