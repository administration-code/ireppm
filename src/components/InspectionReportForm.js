"use client";

import { useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { uploadPhotos } from "@/components/admin/PhotoPicker";
import { MAX_PHOTO_MB } from "@/lib/maintenance";
import { APPLIANCES, CONDITION, GUTTER, ROOF, SUGGESTIONS, blankItem, blankUnit, reportProblem } from "@/lib/inspection-reports";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const YES_NO = { yes: "Yes", no: "No" };

// One tap per answer: big buttons instead of drop-downs. Tapping the chosen one again clears it.
function Pick({ label, hint, options, value, onChange }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {label ? <span className="label-text">{label}</span> : null}
      {hint ? <span className="small">{hint}</span> : null}
      <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(options).map(([k, v]) => {
          const on = value === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              className={`btn ${on ? "primary" : "ghost"} sm`}
              style={{ minHeight: 40, minWidth: 64 }}
              onClick={() => onChange(on ? "" : k)}
            >
              {on ? "✓ " : ""}
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// "Add photos" for one part of the report: opens the camera or photo library, shows small previews.
function Photos({ files = [], onChange, label = "Add photos" }) {
  const [urls, setUrls] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    const u = files.map((f) => (f.type?.startsWith("image/") ? URL.createObjectURL(f) : null));
    setUrls(u);
    return () => u.forEach((x) => x && URL.revokeObjectURL(x));
  }, [files]);
  function add(list) {
    setErr("");
    const picked = Array.from(list || []);
    const big = picked.find((f) => f.size > MAX_PHOTO_MB * 1024 * 1024);
    if (big) return setErr(`${big.name} is over ${MAX_PHOTO_MB} MB.`);
    onChange([...files, ...picked].slice(0, 12));
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} style={{ position: "relative" }}>
            {urls[i] ? (
              <img src={urls[i]} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }} />
            ) : (
              <span className="small" style={{ display: "inline-block", width: 64 }}>
                {f.name}
              </span>
            )}
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 0, background: "var(--ink, #161616)", color: "#fff", fontSize: 12, lineHeight: "22px", padding: 0 }}
            >
              ✕
            </button>
          </div>
        ))}
        <label className="btn ghost sm" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
          📷 {files.length ? "More" : label}
          <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => add(e.target.files)} />
        </label>
      </div>
      {err ? <span className="small err">{err}</span> : null}
    </div>
  );
}

function Part({ title, children }) {
  return (
    <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <b>{title}</b>
      {children}
    </div>
  );
}

// The inspection report form, shared by vendors (Agent Portal) and staff. Everything is a tap, and each part
// has its own photos. properties: [{ id, address, city, units: [{ id, label }] }]. onSubmit(form) returns a promise;
// photos are uploaded first and passed as { path, name }.
export default function InspectionReportForm({ properties, onSubmit, submitLabel = "Submit Report" }) {
  const id = useId();
  const [form, setForm] = useState(() => {
    const only = properties.length === 1 ? properties[0] : null;
    return {
      property_id: only?.id || "",
      inspected_on: today(),
      furnace_filter_swapped: "",
      water_valve_set: "",
      gutter_condition: "",
      roof_condition: "",
      pests: "",
      pests_note: "",
      notes: "",
      photos: {},
      units: only ? only.units.map(blankUnit) : [],
      items: [blankItem()],
    };
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  };
  const setPhotos = (part, files) => setForm((f) => ({ ...f, photos: { ...f.photos, [part]: files } }));
  const property = properties.find((p) => p.id === form.property_id);

  const pickProperty = (pid) => {
    const p = properties.find((x) => x.id === pid);
    setForm((f) => ({ ...f, property_id: pid, units: p ? p.units.map(blankUnit) : [], items: f.items.map((i) => ({ ...i, unit_id: "" })) }));
  };
  const setUnit = (unitId, k, v) => setForm((f) => ({ ...f, units: f.units.map((u) => (u.unit_id === unitId ? { ...u, [k]: v } : u)) }));
  const setUnitPhotos = (unitId, k, files) =>
    setForm((f) => ({ ...f, units: f.units.map((u) => (u.unit_id === unitId ? { ...u, photos: { ...u.photos, [k]: files } } : u)) }));
  const setItem = (key, k, v) => setForm((f) => ({ ...f, items: f.items.map((i) => (i.key === key ? { ...i, [k]: v } : i)) }));
  const addSuggestion = (s) =>
    setForm((f) => {
      const empty = f.items.find((i) => !i.description.trim());
      return empty
        ? { ...f, items: f.items.map((i) => (i.key === empty.key ? { ...i, description: s } : i)) }
        : { ...f, items: [...f.items, { ...blankItem(), description: s }] };
    });

  const photoCount =
    Object.values(form.photos).flat().length +
    form.units.reduce((n, u) => n + Object.values(u.photos || {}).flat().length, 0) +
    form.items.reduce((n, i) => n + (i.photos || []).length, 0);

  async function submit(e) {
    e.preventDefault();
    const problem = reportProblem(form);
    if (problem) return setError(problem);
    setError("");
    try {
      // Upload every photo first, then send the report with where each one went.
      let ready = form;
      if (photoCount) {
        setBusy(`Uploading ${photoCount} photo${photoCount === 1 ? "" : "s"}…`);
        const sb = getBrowserClient();
        const { data } = await sb.auth.getUser();
        const uid = data?.user?.id;
        if (!uid) throw new Error("Sign in again, then submit.");
        const up = async (files) => {
          if (!files?.length) return [];
          const out = await uploadPhotos(sb, uid, files);
          if (out.error) throw new Error(out.error);
          return out.photos;
        };
        const photos = {};
        for (const [k, files] of Object.entries(form.photos)) photos[k] = await up(files);
        const units = [];
        for (const u of form.units) {
          const p = {};
          for (const [k, files] of Object.entries(u.photos || {})) p[k] = await up(files);
          units.push({ ...u, photos: p });
        }
        const items = [];
        for (const i of form.items) items.push({ ...i, photos: await up(i.photos) });
        ready = { ...form, photos, units, items };
      }
      setBusy("Saving…");
      await onSubmit(ready);
    } catch (err) {
      setError(err.message || "That didn't save. Try again.");
      setBusy("");
    }
  }

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={submit} noValidate>
      <section className="boxed stack" aria-labelledby={`${id}-where`}>
        <h2 id={`${id}-where`} className="sec-title">
          Property
        </h2>
        <div role="group" aria-label="Property" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {properties.map((p) => {
            const on = form.property_id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                className={`btn ${on ? "primary" : "ghost"} sm`}
                style={{ minHeight: 44, textAlign: "left", whiteSpace: "normal" }}
                onClick={() => pickProperty(p.id)}
              >
                {on ? "✓ " : ""}
                {p.address}
              </button>
            );
          })}
        </div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor={`${id}-date`}>Inspection date</label>
          <input id={`${id}-date`} type="date" value={form.inspected_on} onChange={(e) => set("inspected_on", e.target.value)} />
        </div>
      </section>

      {property ? (
        <>
          <section className="boxed stack" aria-labelledby={`${id}-prop-checks`}>
            <h2 id={`${id}-prop-checks`} className="sec-title">
              Property Checks
            </h2>
            <Part title="Furnace">
              <Pick label="Furnace filter swapped?" options={YES_NO} value={form.furnace_filter_swapped} onChange={(v) => set("furnace_filter_swapped", v)} />
              <Photos files={form.photos.furnace} onChange={(f) => setPhotos("furnace", f)} label="Furnace photos" />
            </Part>
            <Part title="Water Shut-Off">
              <Pick
                label="Valve set for the season?"
                hint="Off in winter, on in spring."
                options={YES_NO}
                value={form.water_valve_set}
                onChange={(v) => set("water_valve_set", v)}
              />
              <Photos files={form.photos.water_valve} onChange={(f) => setPhotos("water_valve", f)} label="Valve photos" />
            </Part>
            <Part title="Gutters">
              <Pick options={GUTTER} value={form.gutter_condition} onChange={(v) => set("gutter_condition", v)} />
              <Photos files={form.photos.gutters} onChange={(f) => setPhotos("gutters", f)} label="Gutter photos" />
            </Part>
            <Part title="Roof">
              <Pick options={ROOF} value={form.roof_condition} onChange={(v) => set("roof_condition", v)} />
              <Photos files={form.photos.roof} onChange={(f) => setPhotos("roof", f)} label="Roof photos" />
            </Part>
            <Part title="Pests">
              <Pick label="Signs of pests?" options={YES_NO} value={form.pests} onChange={(v) => set("pests", v)} />
              {form.pests === "yes" ? (
                <input aria-label="What and where" value={form.pests_note} onChange={(e) => set("pests_note", e.target.value)} placeholder="What and where: mouse droppings in the basement" />
              ) : null}
              <Photos files={form.photos.pests} onChange={(f) => setPhotos("pests", f)} label="Pest photos" />
            </Part>
            <Part title="Outside and Yard">
              <Photos files={form.photos.exterior} onChange={(f) => setPhotos("exterior", f)} label="Outside photos" />
            </Part>
          </section>

          {form.units.length ? (
            <section className="boxed stack" aria-labelledby={`${id}-unit-checks`}>
              <h2 id={`${id}-unit-checks`} className="sec-title">
                Appliances in Each Unit
              </h2>
              {form.units.map((u) => (
                <div key={u.unit_id} className="stack" style={{ gap: 12, borderTop: "2px solid var(--line)", paddingTop: 12 }}>
                  <b style={{ fontSize: "1.05rem" }}>{u.label || "Main unit"}</b>
                  {APPLIANCES.map(([k, l]) => (
                    <Part key={k} title={l}>
                      <Pick options={CONDITION} value={u[k]} onChange={(v) => setUnit(u.unit_id, k, v)} />
                      <Photos files={u.photos?.[k]} onChange={(f) => setUnitPhotos(u.unit_id, k, f)} label={`${l} photos`} />
                    </Part>
                  ))}
                  <Part title="Anything Else in This Unit">
                    <input aria-label={`Notes for ${u.label || "main unit"}`} value={u.notes} onChange={(e) => setUnit(u.unit_id, "notes", e.target.value)} placeholder="Optional" />
                    <Photos files={u.photos?.notes} onChange={(f) => setUnitPhotos(u.unit_id, "notes", f)} />
                  </Part>
                </div>
              ))}
            </section>
          ) : null}

          <section className="boxed stack" aria-labelledby={`${id}-impr`}>
            <h2 id={`${id}-impr`} className="sec-title">
              Recommended Improvements
            </h2>
            <p className="small" style={{ margin: 0 }}>
              Tap any that apply. No prices yet: the landlord approves or declines each one, then IRep prices the approved ones.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SUGGESTIONS.map((s) => {
                const added = form.items.some((i) => i.description === s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={added}
                    className={`btn ${added ? "primary" : "ghost"} sm`}
                    style={{ minHeight: 40 }}
                    onClick={() =>
                      added
                        ? setForm((f) => {
                            const left = f.items.filter((i) => i.description !== s);
                            return { ...f, items: left.length ? left : [blankItem()] };
                          })
                        : addSuggestion(s)
                    }
                  >
                    {added ? "✓ " : "+ "}
                    {s}
                  </button>
                );
              })}
            </div>
            {form.items.map((i, n) => (
              <div key={i.key} className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div className="field">
                  <label htmlFor={`${id}-i-${i.key}`}>Improvement {n + 1}</label>
                  <input id={`${id}-i-${i.key}`} value={i.description} onChange={(e) => setItem(i.key, "description", e.target.value)} placeholder="Tap one above, or type one" />
                </div>
                {i.description.trim() ? (
                  <>
                    <Pick
                      label="Where"
                      options={{ "": "Whole property", ...Object.fromEntries(property.units.map((u) => [u.id, u.label || "Main unit"])) }}
                      value={i.unit_id}
                      onChange={(v) => setItem(i.key, "unit_id", v)}
                    />
                    <input aria-label={`Details for improvement ${n + 1}`} value={i.details} onChange={(e) => setItem(i.key, "details", e.target.value)} placeholder="Details (optional): new vanity, faucet and mirror" />
                    <Photos files={i.photos} onChange={(f) => setItem(i.key, "photos", f)} />
                    <div>
                      <button
                        type="button"
                        className="link-btn small"
                        onClick={() => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((x) => x.key !== i.key) : [blankItem()] }))}
                      >
                        Remove this one
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
            <div>
              <button type="button" className="btn ghost sm" style={{ minHeight: 40 }} onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }))}>
                + Type my own
              </button>
            </div>
          </section>

          <section className="boxed stack" aria-labelledby={`${id}-notes`}>
            <h2 id={`${id}-notes`} className="sec-title">
              Other Notes
            </h2>
            <textarea aria-label="Other notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" />
            <Photos files={form.photos.notes} onChange={(f) => setPhotos("notes", f)} />
          </section>
        </>
      ) : null}

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={Boolean(busy) || !property} style={{ minHeight: 48 }}>
          {busy || submitLabel}
        </button>
        {photoCount ? <span className="small">{photoCount} photo{photoCount === 1 ? "" : "s"} added</span> : null}
      </div>
    </form>
  );
}
