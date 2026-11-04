"use client";

import { useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { CATEGORIES, URGENCY, URGENCY_HELP, estimateProblem } from "@/lib/maintenance";
import CostEstimateFields from "@/components/admin/CostEstimateFields";
import { SITE } from "@/lib/site";
import PhotoPicker, { uploadPhotos } from "@/components/admin/PhotoPicker";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

const EMPTY = { property_id: "", unit_id: "", category: "other", urgency: "routine", title: "", description: "", est_repair: "", est_replace: "" };

// Partners log a problem they found at one of their properties. It goes to IRep staff as New.
export default function AgentMaintenanceForm({ userId, onLogged }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [props, setProps] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open || props) return;
    (async () => {
      const res = await fetch("/api/agent/maintenance", { headers: await authHeader() });
      const json = await res.json().catch(() => ({}));
      const list = json.properties || [];
      setProps(list);
      if (list.length === 1) setForm((f) => ({ ...f, property_id: list[0].id }));
    })();
  }, [open, props]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value, ...(k === "property_id" ? { unit_id: "" } : {}) }));
    setError("");
  };
  const property = (props || []).find((p) => p.id === form.property_id);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setDone("");
    if (!form.property_id) return setError("Choose the property.");
    if (!form.title.trim()) return setError("Give it a short title, like “Leak under kitchen sink”.");
    if (!form.description.trim()) return setError("Describe what you found.");
    const estProblem = estimateProblem(form.est_repair, "repair estimate") || estimateProblem(form.est_replace, "replacement cost");
    if (estProblem) return setError(estProblem);
    setBusy(true);
    const sb = getBrowserClient();
    let photos = [];
    if (files.length) {
      const up = await uploadPhotos(sb, userId, files);
      if (up.error) {
        setBusy(false);
        return setError(up.error);
      }
      photos = up.photos;
    }
    const res = await fetch("/api/agent/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ ...form, photos }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "That didn't save. Try again.");
    setForm({ ...EMPTY, property_id: props?.length === 1 ? props[0].id : "" });
    setFiles([]);
    setOpen(false);
    setDone("Thanks, IRep has your request. It's assigned to you and listed under Open Jobs while IRep reviews it.");
    onLogged?.();
  }

  return (
    <section className="boxed stack" aria-labelledby="ag-log">
      <div className="admin-head">
        <h2 id="ag-log" className="sec-title">
          Log a Maintenance Request
        </h2>
        {!open ? (
          <button type="button" className="btn primary sm" onClick={() => (setOpen(true), setDone(""))}>
            Log a request
          </button>
        ) : null}
      </div>
      {done ? (
        <div className="okbox" role="status">
          {done}
        </div>
      ) : null}
      {!open ? (
        <p className="small" style={{ margin: 0 }}>
          Found something that needs fixing at one of your properties? Log it here with photos and IRep will follow up.
          Emergencies: call {SITE.emergency.name} at {SITE.emergency.phone} first.
        </p>
      ) : !props ? (
        <p className="small">Loading your properties…</p>
      ) : !props.length ? (
        <p className="small">IRep hasn&apos;t assigned you to any properties yet, so there&apos;s nowhere to log a request.</p>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <div className="row2">
            <div className="field">
              <label htmlFor={`${id}-p`}>Property</label>
              <select id={`${id}-p`} value={form.property_id} onChange={set("property_id")}>
                <option value="">Choose…</option>
                {props.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                    {p.city ? `, ${p.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-u`}>Where</label>
              <select id={`${id}-u`} value={form.unit_id} onChange={set("unit_id")} disabled={!property}>
                <option value="">Whole property (outside or shared areas)</option>
                {(property?.units || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label || "Main unit"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor={`${id}-c`}>Category</label>
              <select id={`${id}-c`} value={form.category} onChange={set("category")}>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-urg`}>How urgent</label>
              <select id={`${id}-urg`} value={form.urgency} onChange={set("urgency")} aria-describedby={`${id}-urg-hint`}>
                {Object.entries(URGENCY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="small" id={`${id}-urg-hint`}>
                {URGENCY_HELP[form.urgency]}
              </span>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${id}-t`}>Title</label>
            <input id={`${id}-t`} value={form.title} onChange={set("title")} maxLength={120} placeholder="Leak under kitchen sink" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-d`}>What you found</label>
            <textarea
              id={`${id}-d`}
              rows={4}
              value={form.description}
              onChange={set("description")}
              placeholder="What's wrong, where exactly, and what you think it needs (parts, time, rough cost)."
            />
          </div>
          <CostEstimateFields
            urgency={form.urgency}
            repair={form.est_repair}
            replace={form.est_replace}
            onRepair={(v) => setForm((f) => ({ ...f, est_repair: v }))}
            onReplace={(v) => setForm((f) => ({ ...f, est_replace: v }))}
          />
          <PhotoPicker
            id={`${id}-photos`}
            files={files}
            setFiles={setFiles}
            onError={setError}
            hint="Add photos straight from your phone. They help IRep and the landlord approve the work faster."
          />
          {error ? (
            <div className="warnbox" role="alert">
              {error}
            </div>
          ) : null}
          <div className="req-actions">
            <button type="submit" className="btn primary sm" disabled={busy}>
              {busy ? "Sending…" : "Send to IRep"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
