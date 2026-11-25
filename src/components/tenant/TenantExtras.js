"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";
import { PAYMENT_KIND_LABEL, methodText, monthLabel, shortDate } from "@/lib/rent";
import { prettyDateTime } from "@/lib/maintenance";

// Tenant portal cards: Coming Up, Is It Fixed?, My Payments, My Documents, My Details, Who to Call.
// All data comes from /api/tenant/portal, limited to the signed-in tenant's own homes.

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

export async function loadPortal() {
  const res = await fetch("/api/tenant/portal", { headers: await authHeader() }).catch(() => null);
  return res?.ok ? res.json().catch(() => null) : null;
}

async function post(body) {
  const res = await fetch("/api/tenant/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  }).catch(() => null);
  const out = res ? await res.json().catch(() => ({})) : {};
  return res?.ok ? out : { error: out.error || "That didn't go through. Check your connection and try again." };
}

const label = (homes, h) => (homes.length > 1 ? <b>{h.home}: </b> : null);

// ---------------------------------------------------------------------------
export function ComingUp({ homes }) {
  const items = homes.flatMap((h) => h.visits.map((v) => ({ ...v, home: h.home })));
  if (!items.length) return null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h3>Coming Up</h3>
      <div className="list">
        {items.map((v) => (
          <div className="it" key={v.id}>
            <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <b>{v.title}</b>
              <span className="small">
                {prettyDateTime(v.at)}
                {homes.length > 1 ? ` · ${v.home}` : ""}
              </span>
              {v.kind === "inspection" ? (
                <p className="req-note">
                  Chuck will look at the common areas (such as the kitchen, living areas, laundry, basement and utility room) and the outside. No
                  bedrooms, unless that&apos;s the only way into the attic. You don&apos;t need to be home. Please let anyone you live with know.
                </p>
              ) : (
                <p className="req-note">A repair visit for your request. If this time doesn&apos;t work, call us at {SITE.phone}.</p>
              )}
            </div>
            <span className="pill">{v.kind === "inspection" ? "Inspection" : "Repair"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function FixCheck({ homes, onDone }) {
  const jobs = homes.flatMap((h) => h.toConfirm.map((j) => ({ ...j, home: h.home })));
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: "" });
  if (!jobs.length && !msg.text) return null;

  async function answer(id, a) {
    setBusy(true);
    const out = await post({ action: "confirm", id, answer: a, note: a === "not_fixed" ? note : "" });
    setBusy(false);
    if (out.error) return setMsg({ ok: false, text: out.error });
    setMsg({
      ok: true,
      text: a === "fixed" ? "Thanks for confirming." : "Thanks for letting us know. We've reopened your request and will be in touch.",
    });
    setOpen(null);
    setNote("");
    onDone?.();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {jobs.length ? <h3>Is It Fixed?</h3> : null}
      {msg.text ? (
        <div className={msg.ok ? "okbox" : "warnbox"} role="status">
          {msg.text}
        </div>
      ) : null}
      {jobs.map((j) => (
        <div className="boxed stack" key={j.id} style={{ gap: 10 }}>
          <div>
            <b>{j.title}</b>
            <p className="small" style={{ margin: "4px 0 0" }}>
              Marked done {j.done_on ? shortDate(j.done_on) : "recently"}
              {homes.length > 1 ? ` · ${j.home}` : ""}. Is everything working now?
            </p>
          </div>
          {open === j.id ? (
            <div className="stack" style={{ gap: 8 }}>
              <label className="small" htmlFor={`fix-${j.id}`}>
                What&apos;s still wrong? (optional)
              </label>
              <textarea id={`fix-${j.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              <div className="req-actions">
                <button type="button" className="btn primary sm" disabled={busy} onClick={() => answer(j.id, "not_fixed")}>
                  {busy ? "Sending…" : "Send to IRep"}
                </button>
                <button type="button" className="link-btn small" onClick={() => setOpen(null)}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="req-actions">
              <button type="button" className="btn primary sm" disabled={busy} onClick={() => answer(j.id, "fixed")}>
                Yes, Fixed
              </button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setOpen(j.id)}>
                Still a Problem
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
const paymentFor = (p) => (p.kind === "rent" ? `Rent for ${monthLabel(p.period)}` : PAYMENT_KIND_LABEL[p.kind] || "Payment");

export function MyPayments({ homes }) {
  const rentHomes = homes.filter((h) => h.collects_rent);
  const [showAll, setShowAll] = useState(false);
  if (!rentHomes.length) return null;
  const thisYear = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 4);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <h3>My Payments</h3>
      {rentHomes.map((h) => {
        const list = showAll ? h.payments : h.payments.slice(0, 6);
        const years = [...new Set(h.payments.map((p) => String(p.received_on).slice(0, 4)))].slice(0, 2);
        return (
          <div key={h.tenancy_id} className="stack" style={{ gap: 8 }}>
            {rentHomes.length > 1 ? <p className="eyebrow" style={{ margin: 0 }}>{h.home}</p> : null}
            {h.balance !== null ? (
              <p style={{ margin: 0 }}>
                {h.balance > 0.5 ? (
                  <>
                    Our records show <b>{money(h.balance)}</b> owing.
                  </>
                ) : h.balance < -0.5 ? (
                  <>
                    You have a credit of <b>{money(-h.balance)}</b>.
                  </>
                ) : (
                  <b>You&apos;re all paid up.</b>
                )}{" "}
                <span className="small">
                  If this doesn&apos;t look right, email us at <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
                </span>
              </p>
            ) : null}
            {h.payments.length ? (
              <>
                <div className="list">
                  {list.map((p) => (
                    <div className="it" key={p.id}>
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <b>{money(p.amount)}</b>
                        <span className="small">
                          {shortDate(p.received_on)} · {paymentFor(p)} · {methodText(p.method)}
                        </span>
                      </div>
                      <Link className="btn ghost sm" href={`/account/receipt?payment=${p.id}`}>
                        Receipt
                      </Link>
                    </div>
                  ))}
                </div>
                <div className="req-actions">
                  {h.payments.length > 6 ? (
                    <button type="button" className="link-btn small" onClick={() => setShowAll(!showAll)}>
                      {showAll ? "Show Fewer" : `Show All ${h.payments.length}`}
                    </button>
                  ) : null}
                  {(years.length ? years : [thisYear]).map((y) => (
                    <Link key={y} className="btn ghost sm" href={`/account/receipt?tenancy=${h.tenancy_id}&from=${y}-01-01&to=${y}-12-31`}>
                      {y} Receipt (All Payments)
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="small">No payments recorded yet.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function MyDocuments({ documents, multi }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!documents?.length) return null;
  async function open(id) {
    setBusy(id);
    setErr("");
    const win = window.open("", "_blank");
    const res = await fetch(`/api/tenant/portal?doc=${encodeURIComponent(id)}`, { headers: await authHeader() }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (out.url) {
      if (win) win.location = out.url;
      else window.location.href = out.url;
    } else {
      win?.close();
      setErr(out.error || "That document isn't available right now.");
    }
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h3>My Documents</h3>
      {err ? (
        <div className="warnbox" role="alert">
          {err}
        </div>
      ) : null}
      <div className="list">
        {documents.map((d) => (
          <div className="it" key={d.id}>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <b>{d.title}</b>
              <span className="small">
                {d.kind === "Lease" ? "Signed" : "Served"} {d.date ? shortDate(d.date) : ""}
                {multi && d.home ? ` · ${d.home}` : ""}
              </span>
            </div>
            <button type="button" className="btn ghost sm" disabled={busy === d.id} onClick={() => open(d.id)}>
              {busy === d.id ? "Opening…" : "Open PDF"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const TIMES = ["Mornings", "Afternoons", "Evenings", "Any time"];

export function MyDetails({ homes, onSaved }) {
  const people = [...new Map(homes.flatMap((h) => h.people).map((p) => [p.id, p])).values()];
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: "" });
  if (!people.length) return null;
  const val = (p, k) => (rows[p.id]?.[k] !== undefined ? rows[p.id][k] : p[k] || "");
  const set = (p, k, v) => setRows((r) => ({ ...r, [p.id]: { ...r[p.id], [k]: v } }));
  const missing = people.filter((p) => !p.me && (!p.email || !p.phone)).length;

  async function save() {
    setBusy(true);
    const out = await post({
      action: "details",
      people: people.map((p) => ({ id: p.id, phone: val(p, "phone"), email: p.me ? undefined : val(p, "email"), contact_time: p.me ? val(p, "contact_time") : undefined })),
    });
    setBusy(false);
    if (out.error) return setMsg({ ok: false, text: out.error });
    setMsg({ ok: true, text: out.changed ? "Saved. Thanks for keeping your details up to date." : "Nothing changed." });
    setOpen(false);
    setRows({});
    onSaved?.();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="admin-head">
        <h3>My Details</h3>
        {!open ? (
          <button type="button" className="btn ghost sm" onClick={() => { setMsg({ ok: false, text: "" }); setOpen(true); }}>
            Update Details
          </button>
        ) : null}
      </div>
      {msg.text ? (
        <div className={msg.ok ? "okbox" : "warnbox"} role="status">
          {msg.text}
        </div>
      ) : null}
      {!open ? (
        <>
          <div className="list">
            {people.map((p) => (
              <div className="it" key={p.id}>
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <b>
                    {p.name}
                    {p.me ? " (you)" : ""}
                  </b>
                  <span className="small">
                    {[p.phone || "No phone on file", p.email || "No email on file", p.me && p.contact_time ? `Best time: ${p.contact_time}` : ""].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {missing ? (
            <p className="small">
              Adding an email for everyone in your home means they also get notices about inspections and repair visits.
            </p>
          ) : null}
        </>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {people.map((p) => (
            <fieldset key={p.id} className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
              <legend>
                <b>
                  {p.name}
                  {p.me ? " (you)" : ""}
                </b>
              </legend>
              {p.me || !p.phone ? (
                <label className="small">
                  Phone
                  <input type="tel" value={val(p, "phone")} onChange={(e) => set(p, "phone", e.target.value)} autoComplete={p.me ? "tel" : "off"} />
                </label>
              ) : (
                <span className="small">Phone: {p.phone}</span>
              )}
              {p.me ? (
                <>
                  <span className="small">Email: {p.email || "none"} (to change your sign-in email, contact us)</span>
                  <span className="small">Best time to reach you</span>
                  <div className="seg">
                    {TIMES.map((t) => (
                      <button key={t} type="button" aria-pressed={val(p, "contact_time") === t} onClick={() => set(p, "contact_time", val(p, "contact_time") === t ? "" : t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              ) : !p.email ? (
                <label className="small">
                  Email
                  <input type="email" value={val(p, "email")} onChange={(e) => set(p, "email", e.target.value)} autoComplete="off" />
                </label>
              ) : (
                <span className="small">Email: {p.email}</span>
              )}
            </fieldset>
          ))}
          <p className="small">To change someone else&apos;s existing phone or email, or a name, email us at {SITE.email}.</p>
          <div className="req-actions">
            <button type="button" className="btn primary sm" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="link-btn small" onClick={() => { setOpen(false); setRows({}); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function WhoToCall({ contacts, homes }) {
  if (!contacts) return null;
  const managed = homes.some((h) => h.managed);
  return (
    <div className="boxed stack" style={{ gap: 8 }}>
      <h3>Who to Call</h3>
      {managed ? (
        <p style={{ margin: 0 }}>
          <b>Emergencies, day or night</b> (flooding, no heat, sewer backup, no water, a fire or gas smell after calling 911):{" "}
          call {contacts.emergency.name} at <a href={`tel:${contacts.emergency.phone.replace(/\D/g, "")}`}>{contacts.emergency.phone}</a>.
        </p>
      ) : null}
      <p style={{ margin: 0 }}>
        <b>Repairs that can wait:</b> use <b>Report a Problem</b> at the top of this page, so we have the details and photos.
      </p>
      <p style={{ margin: 0 }}>
        <b>Everything else:</b> call the office at <a href={`tel:${contacts.office.phone.replace(/\D/g, "")}`}>{contacts.office.phone}</a> ({contacts.office.hours}) or
        email <a href={`mailto:${contacts.office.email}`}>{contacts.office.email}</a>.
      </p>
    </div>
  );
}
