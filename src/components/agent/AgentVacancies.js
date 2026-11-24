"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TapPick from "./TapPick";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { shortDate } from "@/lib/rent";

const TYPES = ["Apartment", "House", "Townhouse", "Room"];
const UTILS = { all: "All utilities included", water: "Water included, tenant pays hydro and gas", none: "Tenant pays all utilities" };
const utilKey = (text) => (/^All/.test(text || "") ? "all" : /^Water/.test(text || "") ? "water" : /^Tenant/.test(text || "") ? "none" : "");
const blank = { unit_id: "", rent: "", available_on: "", property_type: "Apartment", beds: "1", baths: "1", utilities: "", description: "", visibility: "link" };

async function call(method, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch("/api/agent/vacancies", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ error: "Something went wrong. Try again." }));
}

function Photos({ v, onChange }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function add(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    if (files.some((f) => f.size > 10 * 1024 * 1024)) return setMsg("Each photo must be under 10 MB.");
    setBusy(true);
    setMsg(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
    const out = await call("POST", { action: "photo-links", id: v.id, files: files.map((f) => ({ name: f.name, type: f.type })) });
    if (out.error) {
      setBusy(false);
      return setMsg(out.error);
    }
    const sb = getBrowserClient();
    const done = [];
    for (const [i, l] of out.links.entries()) {
      const { error } = await sb.storage.from("listing-photos").uploadToSignedUrl(l.path, l.token, files[i], { contentType: files[i].type });
      if (!error) done.push(l.path);
    }
    const saved = done.length ? await call("POST", { action: "photos-add", id: v.id, paths: done }) : { error: "The upload didn't work. Try again." };
    setBusy(false);
    setMsg(saved.error || (done.length < files.length ? `${done.length} of ${files.length} uploaded.` : ""));
    onChange();
  }
  async function remove(url) {
    setBusy(true);
    await call("POST", { action: "photo-remove", id: v.id, url });
    setBusy(false);
    onChange();
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      {(v.photos || []).length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {v.photos.map((u) => (
            <div key={u} style={{ position: "relative" }}>
              <img src={u} alt="" style={{ width: 84, height: 64, objectFit: "cover", borderRadius: 4 }} />
              <button type="button" className="link-btn small" onClick={() => remove(u)} disabled={busy} aria-label="Remove photo" style={{ position: "absolute", top: 0, right: 2 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <label className="btn ghost sm" style={{ width: "fit-content" }}>
        {busy ? "Uploading…" : (v.photos || []).length ? "Add More Photos" : "Add Photos"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy} onChange={(e) => add(e.target.files)} />
      </label>
      {msg ? <span className="small">{msg}</span> : null}
    </div>
  );
}

function Fields({ f, setF }) {
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      <div className="req-actions" style={{ flexWrap: "wrap" }}>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small">Rent a month</span>
          <input inputMode="numeric" value={f.rent} onChange={(e) => setF((s) => ({ ...s, rent: e.target.value.replace(/\D/g, "") }))} placeholder="1500" style={{ width: 110 }} />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="small">Available</span>
          <input type="date" value={f.available_on} onChange={set("available_on")} />
        </label>
      </div>
      <TapPick label="Type" options={TYPES.map((t) => [t, t])} value={f.property_type} onChange={(v) => setF((s) => ({ ...s, property_type: v }))} />
      {f.property_type !== "Room" ? (
        <TapPick label="Bedrooms" options={["0", "1", "2", "3", "4", "5"].map((n) => [n, n === "0" ? "Studio" : n])} value={f.beds} onChange={(v) => setF((s) => ({ ...s, beds: v }))} />
      ) : null}
      <TapPick label="Bathrooms" options={["1", "1.5", "2", "2.5", "3"].map((n) => [n, n])} value={f.baths} onChange={(v) => setF((s) => ({ ...s, baths: v }))} />
      <TapPick label="Utilities" options={UTILS} value={f.utilities} onChange={(v) => setF((s) => ({ ...s, utilities: v }))} />
      <textarea rows={3} placeholder="A few words about it (optional): parking, laundry, what's nearby" value={f.description} onChange={set("description")} />
      <label className="check-line">
        <input type="checkbox" checked={f.visibility === "public"} onChange={(e) => setF((s) => ({ ...s, visibility: e.target.checked ? "public" : "link" }))} />
        Also show it on ireppm.ca&apos;s rentals page (otherwise only people with the link can see it)
      </label>
    </>
  );
}

// Chuck: put a vacancy up, get the apply link and the Facebook text, take it down when it's rented.
export default function AgentVacancies() {
  const { user, ready, openSignIn } = useAuth();
  const [d, setD] = useState(null);
  const [f, setF] = useState(blank);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setD(await call("GET")), []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!ready) return <p className="small">Loading…</p>;
  if (!user)
    return (
      <div className="empty">
        <h1>Vacancies</h1>
        <button type="button" className="btn primary" onClick={() => openSignIn("/agent/vacancies")}>
          Sign in
        </button>
      </div>
    );
  if (!d) return <p className="small">Loading…</p>;
  if (d.error) return <p className="small">{d.error}</p>;

  async function start(e) {
    e.preventDefault();
    if (!f.unit_id) return setMsg("Choose the unit.");
    if (!f.utilities) return setMsg("Choose the utilities.");
    setBusy(true);
    const out = await call("POST", { action: "start", ...f });
    setBusy(false);
    if (out.error) return setMsg(out.error);
    setMsg("It's up. Copy the Facebook text below and post it.");
    setF(blank);
    load();
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const out = await call("POST", { action: "update", ...edit });
    setBusy(false);
    if (out.error) return setMsg(out.error);
    setEdit(null);
    load();
  }
  const [justShowed, setJustShowed] = useState(null);
  async function close(v, rented) {
    if (!window.confirm(rented ? `Mark ${v.address}${v.unit ? `, ${v.unit}` : ""} as rented and take it down?` : "Take this vacancy down?")) return;
    setBusy(true);
    await call("POST", { action: "close", id: v.id, rented });
    setBusy(false);
    load();
  }
  async function showed(v, undo = false) {
    setBusy(true);
    const out = await call("POST", { action: "showed", id: v.id, undo });
    setBusy(false);
    if (out.error) return setMsg(out.error);
    setJustShowed(undo ? null : v.id);
    load();
  }
  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2500);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  const free = d.units.filter((u) => !u.hasVacancy);
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">
          <Link href="/agent">Agent Portal</Link>
        </span>
        <h1 className="admin-title">Vacancies</h1>
        <p className="small">
          Put a unit up here, then post the text on Facebook. People apply online with the link and upload their own documents, so you don&apos;t need to
          collect anything. Showing requests come to you as usual.
        </p>
      </div>

      {d.vacancies.length ? (
        <section className="boxed stack attention" aria-labelledby="vac-up">
          <h2 id="vac-up" className="sec-title">
            Up Now
          </h2>
          <ul className="req-list">
            {d.vacancies.map((v) => (
              <li className="req stack" key={v.id}>
                <div className="req-top">
                  <b>
                    {v.address}
                    {v.unit ? `, ${v.unit}` : ""} · ${Number(v.rent).toLocaleString("en-CA")}
                  </b>
                  <span className="small">
                    {v.applications} application{v.applications === 1 ? "" : "s"} · {v.showings} showing{v.showings === 1 ? "" : "s"} · {v.visibility === "public" ? "on ireppm.ca" : "link only"}
                  </span>
                </div>
                {edit?.id === v.id ? (
                  <form className="stack" onSubmit={save}>
                    <Fields f={edit} setF={setEdit} />
                    <div className="req-actions">
                      <button type="submit" className="btn primary sm" disabled={busy}>
                        Save
                      </button>
                      <button type="button" className="link-btn small" onClick={() => setEdit(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0, padding: 10, background: "var(--ivory, #F7F4EE)", borderRadius: 6 }}>
                      {v.post}
                    </pre>
                    <div className="req-actions" style={{ flexWrap: "wrap" }}>
                      <button type="button" className="btn primary sm" onClick={() => copy(v.post, `p${v.id}`)}>
                        {copied === `p${v.id}` ? "Copied" : "Copy Facebook Text"}
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => copy(v.link, `l${v.id}`)}>
                        {copied === `l${v.id}` ? "Copied" : "Copy Apply Link"}
                      </button>
                      <button
                        type="button"
                        className="link-btn small"
                        onClick={() =>
                          setEdit({
                            id: v.id,
                            rent: String(v.rent),
                            available_on: v.available_on || "",
                            property_type: v.property_type,
                            beds: String(v.beds),
                            baths: String(v.baths),
                            utilities: utilKey(v.utilities),
                            description: v.description || "",
                            visibility: v.visibility,
                          })
                        }
                      >
                        Change
                      </button>
                      <button type="button" className="link-btn small" onClick={() => close(v, true)} disabled={busy}>
                        Rented
                      </button>
                      <button type="button" className="link-btn small" onClick={() => close(v, false)} disabled={busy}>
                        Take down
                      </button>
                    </div>
                    <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      <div className="req-actions" style={{ flexWrap: "wrap", alignItems: "center" }}>
                        <button type="button" className="btn primary" style={{ minHeight: 48 }} onClick={() => showed(v)} disabled={busy}>
                          I Showed It
                        </button>
                        <Link className="btn ghost sm" style={{ minHeight: 44 }} href={`/agent/vacancies/sign?id=${v.id}`}>
                          Print a QR Sign
                        </Link>
                      </div>
                      <span className="small">
                        {v.shown ? `Shown ${v.shown} time${v.shown === 1 ? "" : "s"}${v.lastShown ? `, last on ${shortDate(v.lastShown)}` : ""}.` : "Tap I Showed It each time you show it."}
                        {justShowed === v.id ? (
                          <>
                            {" "}✓ Logged.{" "}
                            <button type="button" className="link-btn small" onClick={() => showed(v, true)} disabled={busy}>
                              Undo
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <Photos v={v} onChange={load} />
                    <span className="small">Up since {shortDate(String(v.created_at).slice(0, 10))}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form className="boxed stack" onSubmit={start} aria-labelledby="vac-new">
        <h2 id="vac-new" className="sec-title">
          Put a Unit Up
        </h2>
        <TapPick label="Unit" grid options={free.map((u) => [u.id, `${u.place} (${u.state})`])} value={f.unit_id} onChange={(v) => setF((s) => ({ ...s, unit_id: v }))} />
        <Fields f={f} setF={setF} />
        <div className="req-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            Put It Up
          </button>
          {msg ? <span className="small">{msg}</span> : null}
        </div>
      </form>
    </div>
  );
}
