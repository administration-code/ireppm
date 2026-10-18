"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { orNull, text, todayISO } from "@/lib/admin-properties";
import { randomId } from "@/lib/maintenance";
import {
  INSPECTION_BUCKET,
  INSPECTION_KIND,
  INSPECTION_SELECT,
  MAX_PHOTO_MB,
  OVERALL_CONDITION,
  QUICK_ROOMS,
  ROOM_CONDITION,
  allPhotoPaths,
  signPhotos,
  uploadPhoto,
} from "@/lib/inspections";
import { tenantNames, unitAddress } from "@/lib/turnovers";

const UNIT_SELECT = "id, label, property:properties(id, address, city)";
const TENANCY_SELECT = "id, status, start_date, tenancy_tenants(full_name, is_primary, created_at)";

// Works out the unit, tenancy and turnover for a new inspection from whichever one it was started from.
async function loadNew({ unit, tenancy, turnover, kind }) {
  const sb = getBrowserClient();
  let unitId = unit || null;
  let tenancyId = tenancy || null;
  const turnoverId = turnover || null;
  if (turnoverId) {
    const { data } = await sb.from("turnovers").select("id, unit_id, ended_tenancy_id").eq("id", turnoverId).maybeSingle();
    if (!data) return { error: "That turnover wasn't found." };
    unitId = data.unit_id;
    tenancyId = tenancyId || data.ended_tenancy_id;
  }
  if (tenancyId && !unitId) {
    const { data } = await sb.from("tenancies").select("id, unit_id").eq("id", tenancyId).maybeSingle();
    if (!data) return { error: "That tenancy wasn't found." };
    unitId = data.unit_id;
  }
  if (!unitId) return { error: "Start a new inspection from a unit, tenancy or turnover." };
  const [u, t] = await Promise.all([
    sb.from("units").select(UNIT_SELECT).eq("id", unitId).maybeSingle(),
    tenancyId ? sb.from("tenancies").select(TENANCY_SELECT).eq("id", tenancyId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!u.data) return { error: "That unit wasn't found." };
  return {
    inspection: {
      id: randomId(),
      unit_id: unitId,
      tenancy_id: tenancyId,
      turnover_id: turnoverId,
      kind: INSPECTION_KIND[kind] ? kind : turnoverId ? "move_out" : "periodic",
      inspected_on: todayISO(),
      inspected_by: "",
      tenant_present: null,
      overall_condition: null,
      rooms: [],
      keys_returned: null,
      notes: "",
      unit: u.data,
      tenancy: t.data,
    },
    isNew: true,
  };
}

async function loadExisting(id) {
  const { data, error } = await getBrowserClient().from("inspections").select(INSPECTION_SELECT).eq("id", id).maybeSingle();
  if (error) return { error: "We couldn't load this inspection. Refresh the page to try again." };
  if (!data) return { error: "Inspection not found." };
  return { inspection: data, isNew: false };
}

const toForm = (i) => ({
  kind: i.kind,
  inspected_on: text(i.inspected_on),
  inspected_by: text(i.inspected_by),
  tenant_present: i.tenant_present === null || i.tenant_present === undefined ? "" : i.tenant_present ? "yes" : "no",
  overall_condition: text(i.overall_condition),
  keys_returned: text(i.keys_returned),
  notes: text(i.notes),
  rooms: (i.rooms || []).map((r) => ({ key: randomId(), room: r.room || "", condition: r.condition || "", notes: r.notes || "", photos: r.photos || [] })),
});

function validate(f) {
  if (!f.inspected_on) return "Add the inspection date.";
  const keys = String(f.keys_returned).trim();
  if (keys && !/^\d{1,3}$/.test(keys)) return "Keys returned should be a whole number, like 2.";
  if (f.rooms.some((r) => !r.room.trim())) return "Give every room a name.";
  return "";
}

const toRow = (i, f) => ({
  id: i.id,
  unit_id: i.unit_id,
  tenancy_id: i.tenancy_id || null,
  turnover_id: i.turnover_id || null,
  kind: f.kind,
  inspected_on: f.inspected_on,
  inspected_by: orNull(f.inspected_by),
  tenant_present: f.tenant_present === "" ? null : f.tenant_present === "yes",
  overall_condition: f.overall_condition || null,
  keys_returned: String(f.keys_returned).trim() ? Number(f.keys_returned) : null,
  notes: orNull(f.notes),
  rooms: f.rooms.map((r) => ({ room: r.room.trim(), condition: r.condition || null, notes: orNull(r.notes), photos: r.photos })),
});

function RoomCard({ room, index, count, urls, inspectionId, onChange, onRemove, onMove, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const base = `room-${room.key}`;

  async function addPhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const tooBig = files.find((f) => f.size > MAX_PHOTO_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is over ${MAX_PHOTO_MB} MB. Choose a smaller photo.`);
    setUploading(true);
    setError("");
    const added = [];
    for (const file of files) {
      try {
        added.push(await uploadPhoto(inspectionId, file));
      } catch (err) {
        setError(err.message);
      }
    }
    setUploading(false);
    if (added.length) onUploaded(room.key, added);
  }

  return (
    <li className="room-card boxed stack">
      <div className="room-head">
        <div className="field">
          <label htmlFor={`${base}-name`}>Room</label>
          <input id={`${base}-name`} value={room.room} onChange={(e) => onChange({ room: e.target.value })} autoComplete="off" />
        </div>
        <div className="room-order">
          <button type="button" className="btn ghost sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${room.room || "room"} up`}>
            ↑
          </button>
          <button type="button" className="btn ghost sm" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${room.room || "room"} down`}>
            ↓
          </button>
          <button type="button" className="btn ghost sm" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <fieldset className="check-group">
        <legend className="small">Condition</legend>
        <div className="seg">
          {Object.entries(ROOM_CONDITION).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={room.condition === k} onClick={() => onChange({ condition: room.condition === k ? "" : k })}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`${base}-notes`}>Notes</label>
        <textarea id={`${base}-notes`} rows={2} value={room.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {room.photos.length ? (
          <ul className="insp-photos">
            {room.photos.map((p) => (
              <li key={p.path}>
                {urls[p.path] ? (
                  <a href={urls[p.path]} target="_blank" rel="noreferrer">
                    <img src={urls[p.path]} alt={`${room.room || "Room"}: ${p.name}`} />
                  </a>
                ) : (
                  <span className="insp-photo-wait small">Loading…</span>
                )}
                <button
                  type="button"
                  className="link-btn small"
                  onClick={() => onChange({ photos: room.photos.filter((x) => x.path !== p.path) }, p.path)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="btn ghost sm insp-upload">
          {uploading ? "Uploading…" : "Add photos"}
          <input type="file" accept="image/*" multiple onChange={addPhotos} disabled={uploading} className="visually-hidden" />
        </label>
        {error ? (
          <span className="small err" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export default function InspectionEditor({ id, context }) {
  const [state, setState] = useState({ loading: true, inspection: null, isNew: false, error: "" });
  const [form, setForm] = useState(null);
  const [urls, setUrls] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [customRoom, setCustomRoom] = useState("");
  const formRef = useRef(null);
  formRef.current = form;

  const contextKey = context ? JSON.stringify(context) : "";
  useEffect(() => {
    let alive = true;
    const load = id ? loadExisting(id) : loadNew(JSON.parse(contextKey || "{}"));
    load.then((data) => {
      if (!alive) return;
      setState({ loading: false, inspection: data.inspection || null, isNew: Boolean(data.isNew), error: data.error || "" });
      if (data.inspection) setForm(toForm(data.inspection));
    });
    return () => {
      alive = false;
    };
  }, [id, contextKey]);

  const photoKey = form ? allPhotoPaths(form.rooms).join("|") : "";
  useEffect(() => {
    const missing = photoKey ? photoKey.split("|").filter((p) => !urls[p]) : [];
    if (!missing.length) return;
    let alive = true;
    signPhotos(missing).then((signed) => alive && setUrls((u) => ({ ...u, ...signed })));
    return () => {
      alive = false;
    };
  }, [photoKey, urls]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const { loading, inspection, isNew, error } = state;
  if (loading) return <p className="small">Loading inspection…</p>;
  if (!inspection || !form) {
    return (
      <div className="empty">
        <h2>{error === "Inspection not found." ? "Inspection not found" : "Something went wrong"}</h2>
        <p>{error}</p>
        <Link className="btn ghost" href="/admin/properties">
          Back to Properties
        </Link>
      </div>
    );
  }

  async function persist(nextForm, okText) {
    const problem = validate(nextForm);
    if (problem) {
      setMsg({ kind: "err", text: problem });
      return false;
    }
    setSaving(true);
    const { error: err } = await getBrowserClient().from("inspections").upsert(toRow(inspection, nextForm)).select("id");
    setSaving(false);
    if (err) {
      setMsg({ kind: "err", text: "We couldn't save this inspection. Check the fields and try again." });
      return false;
    }
    if (isNew) {
      setState((s) => ({ ...s, isNew: false }));
      window.history.replaceState(null, "", `/admin/inspections/${inspection.id}`);
    }
    setDirty(false);
    setMsg({ kind: "ok", text: okText });
    return true;
  }

  const change = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setMsg({ kind: "", text: "" });
  };
  const update = (key) => (e) => change({ [key]: e.target.value });

  const setRooms = (rooms) => change({ rooms });
  const addRoom = (name) => setRooms([...form.rooms, { key: randomId(), room: name, condition: "", notes: "", photos: [] }]);

  function changeRoom(key, patch, removedPath) {
    setRooms(form.rooms.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    if (removedPath) getBrowserClient().storage.from(INSPECTION_BUCKET).remove([removedPath]);
  }

  function moveRoom(index, delta) {
    const next = [...form.rooms];
    const [room] = next.splice(index, 1);
    next.splice(index + delta, 0, room);
    setRooms(next);
  }

  function removeRoom(room) {
    if (room.photos.length && !window.confirm(`Remove ${room.room || "this room"} and its ${room.photos.length} photos?`)) return;
    setRooms(form.rooms.filter((r) => r.key !== room.key));
    if (room.photos.length) {
      getBrowserClient().storage.from(INSPECTION_BUCKET).remove(room.photos.map((p) => p.path));
    }
  }

  // Photos are saved straight away so an upload is never lost if the page is closed.
  function photosUploaded(key, added) {
    const latest = formRef.current;
    const next = { ...latest, rooms: latest.rooms.map((r) => (r.key === key ? { ...r, photos: [...r.photos, ...added] } : r)) };
    setForm(next);
    persist(next, `${added.length} ${added.length === 1 ? "photo" : "photos"} saved.`);
  }

  function save(e) {
    e.preventDefault();
    persist(form, "Inspection saved.");
  }

  const backHref = inspection.turnover_id ? `/admin/turnovers/${inspection.turnover_id}` : `/admin/units/${inspection.unit_id}`;
  const tenants = tenantNames(inspection.tenancy);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href={backHref}>
          ← {inspection.turnover_id ? "Turnover" : "Unit"}
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="eyebrow">Staff · Inspection</span>
            <h1 className="admin-title">{isNew ? "New inspection" : `${INSPECTION_KIND[form.kind]} inspection`}</h1>
            <p className="small">
              {[unitAddress(inspection.unit), tenants ? `Tenants: ${tenants}` : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
          {!isNew ? (
            <Link className="btn ghost sm" href={`/admin/inspections/${inspection.id}/print`}>
              Print / Save as PDF
            </Link>
          ) : null}
        </div>
      </div>

      <form className="admin-form stack" onSubmit={save} noValidate style={{ gap: 24 }}>
        <section className="boxed stack" aria-labelledby="sec-insp-details">
          <h2 id="sec-insp-details" className="sec-title">
            Details
          </h2>
          <div className="row2">
            <div className="field">
              <label htmlFor="i-kind">Kind</label>
              <select id="i-kind" value={form.kind} onChange={update("kind")}>
                {Object.entries(INSPECTION_KIND).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="i-date">Date</label>
              <input id="i-date" type="date" value={form.inspected_on} onChange={update("inspected_on")} required />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="i-by">Inspected by</label>
              <input id="i-by" value={form.inspected_by} onChange={update("inspected_by")} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="i-present">Tenant present</label>
              <select id="i-present" value={form.tenant_present} onChange={update("tenant_present")}>
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="i-overall">Overall condition</label>
              <select id="i-overall" value={form.overall_condition} onChange={update("overall_condition")}>
                <option value="">Not set</option>
                {Object.entries(OVERALL_CONDITION).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="i-keys">Keys returned</label>
              <input id="i-keys" type="number" inputMode="numeric" min="0" step="1" value={form.keys_returned} onChange={update("keys_returned")} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="i-notes">Notes</label>
            <textarea id="i-notes" value={form.notes} onChange={update("notes")} rows={3} />
          </div>
        </section>

        <section className="stack" aria-labelledby="sec-insp-rooms">
          <h2 id="sec-insp-rooms" className="sec-title">
            Rooms
          </h2>
          {form.rooms.length ? (
            <ul className="room-list">
              {form.rooms.map((r, i) => (
                <RoomCard
                  key={r.key}
                  room={r}
                  index={i}
                  count={form.rooms.length}
                  urls={urls}
                  inspectionId={inspection.id}
                  onChange={(patch, removedPath) => changeRoom(r.key, patch, removedPath)}
                  onRemove={() => removeRoom(r)}
                  onMove={(delta) => moveRoom(i, delta)}
                  onUploaded={photosUploaded}
                />
              ))}
            </ul>
          ) : (
            <p className="small">No rooms yet. Add the rooms you inspect, in the order you walk through.</p>
          )}

          <div className="boxed stack">
            <h3 className="sub-title">Add Room</h3>
            <div className="seg">
              {QUICK_ROOMS.map((name) => (
                <button key={name} type="button" onClick={() => addRoom(name)}>
                  {name}
                </button>
              ))}
            </div>
            <div className="task-add">
              <label className="visually-hidden" htmlFor="i-custom-room">
                Other room name
              </label>
              <input
                id="i-custom-room"
                value={customRoom}
                onChange={(e) => setCustomRoom(e.target.value)}
                placeholder="Other room, e.g. Garage"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn ghost sm"
                disabled={!customRoom.trim()}
                onClick={() => {
                  addRoom(customRoom.trim());
                  setCustomRoom("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        </section>

        <div className="save-bar">
          <span className={`small ${msg.kind === "err" ? "err" : ""}`} role={msg.kind === "err" ? "alert" : "status"}>
            {msg.text || (dirty ? "You have unsaved changes." : isNew ? "Not saved yet." : "All changes saved.")}
          </span>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Save inspection" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
