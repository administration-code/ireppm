"use client";

import { useId, useState } from "react";
import { APPLIANCES, CONDITION, GUTTER, SUGGESTIONS, blankItem, blankUnit, reportProblem } from "@/lib/inspection-reports";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

function YesNo({ id, label, hint, value, onChange }) {
  return (
    <fieldset className="field">
      <legend className="label-text">{label}</legend>
      {hint ? <span className="small">{hint}</span> : null}
      <div className="req-actions">
        {[
          ["yes", "Yes"],
          ["no", "No"],
        ].map(([v, l]) => (
          <label key={v} className="check-line">
            <input type="radio" name={id} value={v} checked={value === v} onChange={() => onChange(v)} />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Choice({ id, label, options, value, onChange }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

// The inspection report form, shared by vendors (Agent Portal) and staff.
// properties: [{ id, address, city, units: [{ id, label }] }]. onSubmit(form) returns a promise.
export default function InspectionReportForm({ properties, onSubmit, submitLabel = "Submit report" }) {
  const id = useId();
  const [form, setForm] = useState(() => {
    const only = properties.length === 1 ? properties[0] : null;
    return {
      property_id: only?.id || "",
      inspected_on: today(),
      furnace_filter_swapped: "",
      water_valve_set: "",
      gutter_condition: "",
      pests: "",
      pests_note: "",
      notes: "",
      units: only ? only.units.map(blankUnit) : [],
      items: [blankItem()],
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  };
  const property = properties.find((p) => p.id === form.property_id);

  const pickProperty = (pid) => {
    const p = properties.find((x) => x.id === pid);
    setForm((f) => ({ ...f, property_id: pid, units: p ? p.units.map(blankUnit) : [], items: f.items.map((i) => ({ ...i, unit_id: "" })) }));
  };
  const setUnit = (unitId, k, v) => setForm((f) => ({ ...f, units: f.units.map((u) => (u.unit_id === unitId ? { ...u, [k]: v } : u)) }));
  const setItem = (key, k, v) => setForm((f) => ({ ...f, items: f.items.map((i) => (i.key === key ? { ...i, [k]: v } : i)) }));
  const addSuggestion = (s) =>
    setForm((f) => {
      const empty = f.items.find((i) => !i.description.trim());
      return empty
        ? { ...f, items: f.items.map((i) => (i.key === empty.key ? { ...i, description: s } : i)) }
        : { ...f, items: [...f.items, { ...blankItem(), description: s }] };
    });

  async function submit(e) {
    e.preventDefault();
    const problem = reportProblem(form);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || "That didn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={submit} noValidate>
      <section className="boxed stack" aria-labelledby={`${id}-where`}>
        <h2 id={`${id}-where`} className="sec-title">
          Property
        </h2>
        <div className="row2">
          <div className="field">
            <label htmlFor={`${id}-prop`}>Property</label>
            <select id={`${id}-prop`} value={form.property_id} onChange={(e) => pickProperty(e.target.value)}>
              <option value="">Choose…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                  {p.city ? `, ${p.city}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-date`}>Inspection date</label>
            <input id={`${id}-date`} type="date" value={form.inspected_on} onChange={(e) => set("inspected_on", e.target.value)} />
          </div>
        </div>
      </section>

      {property ? (
        <>
          <section className="boxed stack" aria-labelledby={`${id}-prop-checks`}>
            <h2 id={`${id}-prop-checks`} className="sec-title">
              Property Checks
            </h2>
            <div className="row2">
              <YesNo
                id={`${id}-filter`}
                label="Furnace filter swapped"
                value={form.furnace_filter_swapped}
                onChange={(v) => set("furnace_filter_swapped", v)}
              />
              <YesNo
                id={`${id}-valve`}
                label="Water shut-off valve set for the season"
                hint="Off in winter, on in spring."
                value={form.water_valve_set}
                onChange={(v) => set("water_valve_set", v)}
              />
            </div>
            <div className="row2">
              <Choice
                id={`${id}-gutter`}
                label="Gutter condition"
                options={GUTTER}
                value={form.gutter_condition}
                onChange={(v) => set("gutter_condition", v)}
              />
              <YesNo id={`${id}-pests`} label="Signs of pests" value={form.pests} onChange={(v) => set("pests", v)} />
            </div>
            {form.pests === "yes" ? (
              <div className="field">
                <label htmlFor={`${id}-pn`}>What and where</label>
                <input id={`${id}-pn`} value={form.pests_note} onChange={(e) => set("pests_note", e.target.value)} placeholder="Mouse droppings in the basement" />
              </div>
            ) : null}
          </section>

          {form.units.length ? (
            <section className="boxed stack" aria-labelledby={`${id}-unit-checks`}>
              <h2 id={`${id}-unit-checks`} className="sec-title">
                Unit Checks
              </h2>
              {form.units.map((u) => (
                <fieldset key={u.unit_id} className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <legend className="label-text">
                    <b>{u.label || "Main unit"}</b>
                  </legend>
                  <div className="row4">
                    {APPLIANCES.map(([k, l]) => (
                      <Choice key={k} id={`${id}-${u.unit_id}-${k}`} label={l} options={CONDITION} value={u[k]} onChange={(v) => setUnit(u.unit_id, k, v)} />
                    ))}
                  </div>
                  <div className="field">
                    <label htmlFor={`${id}-${u.unit_id}-n`}>Notes (optional)</label>
                    <input id={`${id}-${u.unit_id}-n`} value={u.notes} onChange={(e) => setUnit(u.unit_id, "notes", e.target.value)} />
                  </div>
                </fieldset>
              ))}
            </section>
          ) : null}

          <section className="boxed stack" aria-labelledby={`${id}-impr`}>
            <h2 id={`${id}-impr`} className="sec-title">
              Recommended Improvements
            </h2>
            <p className="small" style={{ margin: 0 }}>
              One line per improvement. No prices yet: the landlord approves or declines each line, then IRep prices the approved ones.
            </p>
            <div className="req-actions" style={{ flexWrap: "wrap" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="btn ghost sm" onClick={() => addSuggestion(s)}>
                  + {s}
                </button>
              ))}
            </div>
            {form.items.map((i, n) => (
              <div key={i.key} className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div className="row3">
                  <div className="field">
                    <label htmlFor={`${id}-i-${i.key}`}>Improvement {n + 1}</label>
                    <input id={`${id}-i-${i.key}`} value={i.description} onChange={(e) => setItem(i.key, "description", e.target.value)} placeholder="Washroom refresh" />
                  </div>
                  <div className="field">
                    <label htmlFor={`${id}-iu-${i.key}`}>Where</label>
                    <select id={`${id}-iu-${i.key}`} value={i.unit_id} onChange={(e) => setItem(i.key, "unit_id", e.target.value)}>
                      <option value="">Whole property</option>
                      {property.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label || "Main unit"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ alignSelf: "end" }}>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((x) => x.key !== i.key) : [blankItem()] }))}
                    >
                      Remove<span className="visually-hidden"> improvement {n + 1}</span>
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-id-${i.key}`}>Details (optional)</label>
                  <input id={`${id}-id-${i.key}`} value={i.details} onChange={(e) => setItem(i.key, "details", e.target.value)} placeholder="New vanity, faucet and mirror; re-caulk the tub" />
                </div>
              </div>
            ))}
            <div>
              <button type="button" className="btn ghost sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }))}>
                Add a line
              </button>
            </div>
          </section>

          <section className="boxed stack" aria-labelledby={`${id}-notes`}>
            <h2 id={`${id}-notes`} className="sec-title">
              Other Notes
            </h2>
            <div className="field">
              <label htmlFor={`${id}-notes-in`} className="visually-hidden">
                Other notes
              </label>
              <textarea id={`${id}-notes-in`} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </section>
        </>
      ) : null}

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="submit" className="btn primary" disabled={busy || !property}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
