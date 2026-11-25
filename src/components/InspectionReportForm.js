"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { uploadPhotos } from "@/components/admin/PhotoPicker";
import { MAX_PHOTO_MB } from "@/lib/maintenance";
import { APPLIANCES, CONDITION, GUTTER, ROOF, SUGGESTIONS, blankItem, blankUnit, checkItems, priceValue, quoteTotals, reportProblem } from "@/lib/inspection-reports";
import { money } from "@/lib/format";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const YES_NO = { yes: "Yes", no: "No" };
const isFile = (x) => typeof File !== "undefined" && x instanceof File;
// Applies fn to every picked File anywhere in the form (photos already uploaded are { path, name }).
function mapFiles(v, fn) {
  if (isFile(v)) return fn(v);
  if (Array.isArray(v)) return v.map((x) => mapFiles(x, fn));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapFiles(x, fn)]));
  return v;
}
const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });

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
    const u = files.map((f) => (isFile(f) && f.type?.startsWith("image/") ? URL.createObjectURL(f) : null));
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
            ) : !isFile(f) ? (
              <span className="small" style={{ display: "inline-flex", width: 64, height: 64, alignItems: "center", justifyContent: "center", textAlign: "center", borderRadius: 6, background: "var(--ivory, #F7F4EE)", border: "1px solid var(--line)" }}>
                📷 Saved
              </span>
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
// Optional: initial (a saved draft's form), onSaveDraft(form) → { saved_at } (turns on autosave and
// "Save and Finish Later"), onLater() after a manual save, and sendLabel for the final button on the quote step.
// lastByProperty (optional): { [property_id]: { inspected_on, gutter_condition, roof_condition, units: { [unit_id]: {...} }, items: [...] } }
// from the property's last inspection, for "Start From Last Time".
export default function InspectionReportForm({ properties, onSubmit, submitLabel = "Submit Report", initial = null, onSaveDraft = null, onLater = null, lastByProperty = null }) {
  const id = useId();
  const [step, setStep] = useState("checks");
  const [save, setSave] = useState({ state: "", at: initial?._saved_at || null, error: "" });
  const [form, setForm] = useState(() => {
    if (initial) return { prices: {}, check_details: {}, photos: {}, units: [], items: [blankItem()], ...initial };
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
      prices: {},
      check_details: {},
    };
  });
  const formRef = useRef(form);
  formRef.current = form;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  };
  const setPhotos = (part, files) => setForm((f) => ({ ...f, photos: { ...f.photos, [part]: files } }));
  const property = properties.find((p) => p.id === form.property_id);

  const pickProperty = (pid) => {
    setCopied(false);
    const p = properties.find((x) => x.id === pid);
    setForm((f) => ({ ...f, property_id: pid, units: p ? p.units.map(blankUnit) : [], items: f.items.map((i) => ({ ...i, unit_id: "" })) }));
  };
  // Copies the answers that usually stay the same (gutters, roof, appliances, open improvements) from last time.
  // Filter, water valve and pests are left blank: they're checked fresh every visit. No photos are copied.
  const [copied, setCopied] = useState(false);
  const last = form.property_id ? lastByProperty?.[form.property_id] : null;
  const copyLast = () => {
    if (!last) return;
    setForm((f) => ({
      ...f,
      gutter_condition: last.gutter_condition || f.gutter_condition,
      roof_condition: last.roof_condition || f.roof_condition,
      units: f.units.map((u) => {
        const l = last.units?.[u.unit_id];
        return l ? { ...u, stove: l.stove || "", fridge: l.fridge || "", washer: l.washer || "", dryer: l.dryer || "" } : u;
      }),
      items: last.items?.length
        ? last.items.map((i) => ({ ...blankItem(), unit_id: f.units.some((u) => u.unit_id === i.unit_id) ? i.unit_id : "", description: i.description, details: i.details || "" }))
        : f.items,
    }));
    setCopied(true);
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

  // Uploads any photos not uploaded yet and swaps them in the form for { path, name }. Returns the ready form.
  async function uploadPending(current) {
    const files = [];
    mapFiles(current, (f) => (files.push(f), f));
    if (!files.length) return current;
    const sb = getBrowserClient();
    const { data } = await sb.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) throw new Error("Sign in again, then try again.");
    const out = await uploadPhotos(sb, uid, files);
    if (out.error) throw new Error(out.error);
    const done = new Map(files.map((f, i) => [f, out.photos[i]]));
    setForm((f) => mapFiles(f, (x) => done.get(x) || x));
    return mapFiles(current, (x) => done.get(x) || x);
  }

  // Autosave: a few seconds after each change (vendors only; needs onSaveDraft).
  const saving = useRef(false);
  const again = useRef(false);
  const first = useRef(true);
  async function saveDraft({ manual = false } = {}) {
    if (!onSaveDraft || !formRef.current.property_id) return false;
    if (saving.current) {
      again.current = true;
      return false;
    }
    saving.current = true;
    setSave((s) => ({ ...s, state: "saving", error: "" }));
    try {
      const ready = await uploadPending(formRef.current);
      const out = await onSaveDraft(ready);
      setSave({ state: "saved", at: out?.saved_at || new Date().toISOString(), error: "" });
      return true;
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setSave((s) => ({ ...s, state: offline ? "offline" : "error", error: err.message || "Not saved." }));
      if (manual) setError(err.message || "That didn't save. Try again.");
      return false;
    } finally {
      saving.current = false;
      if (again.current) {
        again.current = false;
        saveDraft();
      }
    }
  }
  // No signal (basements): keep going; everything stays on the phone and saves when the signal is back.
  useEffect(() => {
    if (!onSaveDraft) return;
    const back = () => saveDraft();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!onSaveDraft || !form.property_id || busy) return;
    const t = setTimeout(() => saveDraft(), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // What Chuck prices: checks marked as needing work, then the improvements.
  const unitLabel = (uid) => property?.units.find((u) => u.id === uid)?.label || "Whole property";
  const quoteLines = property
    ? [
        ...checkItems(form).map((c) => ({ key: c.key, title: c.description, where: c.unit_label || "Whole property", photos: c.photos.length, from: "From the checks", check: true })),
        ...form.items
          .filter((i) => i.description.trim())
          .map((i) => ({ key: i.key, title: i.description.trim(), where: i.unit_id ? unitLabel(i.unit_id) : "Whole property", photos: (i.photos || []).length, from: "Improvement", details: i.details })),
      ]
    : [];
  const totals = quoteTotals(quoteLines.map((l) => form.prices?.[l.key]));
  const unpriced = quoteLines.filter((l) => priceValue(form.prices?.[l.key]) === null).length;
  const setPrice = (k, v) => setForm((f) => ({ ...f, prices: { ...f.prices, [k]: v } }));
  const setCheckDetail = (k, v) => setForm((f) => ({ ...f, check_details: { ...f.check_details, [k]: v } }));

  function toQuote() {
    const problem = reportProblem(form);
    if (problem) return setError(problem);
    setError("");
    setStep("quote");
    window.scrollTo(0, 0);
  }

  async function later() {
    setBusy("Saving…");
    const ok = await saveDraft({ manual: true });
    setBusy("");
    if (ok) onLater?.();
  }

  async function submit(e) {
    e.preventDefault();
    if (step === "checks" && quoteLines.length) return toQuote();
    const problem = reportProblem(form);
    if (problem) return setError(problem);
    for (const l of quoteLines) {
      const v = form.prices?.[l.key];
      if (String(v ?? "").trim() && priceValue(v) === null) return setError(`Check the price for “${l.title}”: numbers only, like 850.`);
    }
    setError("");
    try {
      let toUpload = 0;
      mapFiles(formRef.current, (f) => (toUpload++, f));
      if (toUpload) setBusy(`Uploading ${toUpload} photo${toUpload === 1 ? "" : "s"}…`);
      const ready = await uploadPending(formRef.current);
      setBusy("Sending…");
      await onSubmit(ready);
    } catch (err) {
      setError(err.message || "That didn't save. Try again.");
      setBusy("");
    }
  }

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={submit} noValidate>
      {onSaveDraft && form.property_id ? (
        <p className="small" role="status" style={{ margin: 0, color: save.state === "error" ? "var(--red, #B41710)" : undefined }}>
          {save.state === "saving"
            ? "Saving…"
            : save.state === "offline"
              ? "No signal right now. Keep going: your answers and photos stay on this phone and save when you're back online. Don't close this page."
              : save.state === "error"
              ? `Not saved yet: ${save.error}`
              : save.at
                ? `✓ Saved ${timeOf(save.at)}. It saves as you go.`
                : "It saves as you go."}
        </p>
      ) : null}
      {step === "checks" ? (
      <>
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
        {last && (!initial || initial._fresh) ? (
          copied ? (
            <p className="small" role="status" style={{ margin: 0 }}>
              ✓ Filled in from {last.inspected_on}. Change anything that&apos;s different. The furnace filter, water valve and pests are blank: check those fresh.
            </p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <button type="button" className="btn ghost" style={{ minHeight: 48 }} onClick={copyLast}>
                Start From Last Time ({last.inspected_on})
              </button>
              <span className="small">Fills in the gutters, roof, appliances and open improvements from the last inspection.</span>
            </div>
          )
        ) : null}
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
              Tap any that apply. You&apos;ll add a price for each one on the next step.
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
      </>
      ) : (
        <section className="boxed stack" aria-labelledby={`${id}-quote`}>
          <div>
            <button type="button" className="link-btn small" onClick={() => { setStep("checks"); window.scrollTo(0, 0); }}>
              ← Back to the checks
            </button>
          </div>
          <h2 id={`${id}-quote`} className="sec-title">
            Quote the Repairs
          </h2>
          <p className="small" style={{ margin: 0 }}>
            {property?.address} · Enter your price before HST for each item. The landlord sees these as estimates and approves the ones they want.
          </p>
          {quoteLines.map((l) => (
            <div key={l.key} className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div>
                <b>{l.title}</b>
                <span className="small sub-line">
                  {l.where} · {l.from}
                  {l.photos ? ` · ${l.photos} photo${l.photos === 1 ? "" : "s"}` : ""}
                </span>
                {l.details ? <span className="small sub-line">{l.details}</span> : null}
              </div>
              {l.check ? (
                <input
                  aria-label={`What's needed for ${l.title}`}
                  value={form.check_details?.[l.key] || ""}
                  onChange={(e) => setCheckDetail(l.key, e.target.value)}
                  placeholder="What's needed (optional): replace front and rear gutters"
                />
              ) : null}
              <div className="field" style={{ maxWidth: 240 }}>
                <label htmlFor={`${id}-p-${l.key}`}>Price before HST</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "1.2rem" }}>$</span>
                  <input
                    id={`${id}-p-${l.key}`}
                    inputMode="decimal"
                    value={form.prices?.[l.key] ?? ""}
                    onChange={(e) => setPrice(l.key, e.target.value)}
                    placeholder="0"
                    style={{ fontSize: "1.2rem", minHeight: 48 }}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="stack" style={{ gap: 4, borderTop: "2px solid var(--line)", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <span className="num">{money(totals.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>HST (13%)</span>
              <span className="num">{money(totals.hst)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: "1.15rem" }}>
              <span>Estimated total</span>
              <span className="num">{money(totals.total)}</span>
            </div>
          </div>
          {unpriced ? (
            <p className="small" style={{ margin: 0 }}>
              {unpriced} item{unpriced === 1 ? " has" : "s have"} no price. The landlord will see &ldquo;Price to be confirmed&rdquo;.
            </p>
          ) : null}
          <p className="small" style={{ margin: 0 }}>
            The landlord&apos;s report says these are estimates only, not a fixed quote, and that approved work is billed on a separate invoice.
          </p>
        </section>
      )}

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={Boolean(busy) || !property} style={{ minHeight: 48 }}>
          {busy || (step === "checks" && quoteLines.length ? "Next: Quote the Repairs" : submitLabel)}
        </button>
        {onSaveDraft && property ? (
          <button type="button" className="btn ghost" disabled={Boolean(busy)} style={{ minHeight: 48 }} onClick={later}>
            Save and Finish Later
          </button>
        ) : null}
        {photoCount && step === "checks" ? <span className="small">{photoCount} photo{photoCount === 1 ? "" : "s"} added</span> : null}
      </div>
    </form>
  );
}
