"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { currentTenancy, propertyTitle, sortTenants } from "@/lib/admin-properties";
import { isSpecialUnit } from "@/lib/maintenance-units";
import { docusignApi } from "@/lib/signatures";
import { refreshStaffCounts } from "@/lib/admin-nav";

const BUCKET = "signed-documents";
const MAX_MB = 25;
const ROLES = ["Tenant", "Landlord", "Guarantor", "Other"];

const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const safe = (name) => String(name || "document.pdf").replace(/[^\w.\-]+/g, "_").slice(-80);

function signersFrom(tenancy, owner) {
  const list = sortTenants(tenancy?.tenancy_tenants || [])
    .filter((t) => t.full_name || t.email)
    .map((t) => ({ name: t.full_name || "", email: t.email || "", role: "Tenant" }));
  if (owner?.name || owner?.email) list.push({ name: owner.name || "", email: owner.email || "", role: "Landlord" });
  return list.length ? list : [{ name: "", email: "", role: "Tenant" }];
}

// Upload your own PDF (an amended lease, an addendum…) and send it through DocuSign.
export default function UploadForm({ ctx }) {
  const router = useRouter();
  const [props, setProps] = useState(null);
  const [link, setLink] = useState({ property_id: ctx.property?.id || "", unit_id: ctx.unit?.id || "" });
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState("");
  const [signers, setSigners] = useState(() => signersFrom(ctx.tenancy, ctx.owner));
  const [ordered, setOrdered] = useState(false);
  const [ccIrep, setCcIrep] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("properties")
      .select(
        "id, address, city, archived, owner_id, owner:owners(id, name, email), units(id, label, tenancies(id, status, tenancy_tenants(full_name, email, phone, is_primary, created_at)))"
      )
      .eq("archived", false)
      .order("address")
      .then(({ data }) => alive && setProps(data || []));
    return () => {
      alive = false;
    };
  }, []);

  const property = (props || []).find((p) => p.id === link.property_id);
  const units = (property?.units || []).filter((u) => !isSpecialUnit(u)).sort((a, b) => String(a.label).localeCompare(String(b.label), "en-CA", { numeric: true }));
  const unit = units.find((u) => u.id === link.unit_id) || null;
  const tenancy = ctx.tenancy && ctx.tenancy.unit_id === link.unit_id ? ctx.tenancy : unit ? currentTenancy(unit.tenancies || []) : null;

  function pickUnit(unitId, prop = property) {
    const u = (prop?.units || []).find((x) => x.id === unitId);
    const t = u ? currentTenancy(u.tenancies || []) : null;
    setLink((l) => ({ ...l, unit_id: unitId }));
    if (t || prop?.owner) setSigners(signersFrom(t, prop?.owner));
    if (!title && u) setTitle(`Lease amendment: ${[prop.address, u.label].filter(Boolean).join(", ")}`);
  }

  function addFiles(list) {
    setError("");
    const picked = Array.from(list || []);
    const notPdf = picked.find((f) => f.type !== "application/pdf" && !/\.pdf$/i.test(f.name));
    if (notPdf) return setError(`${notPdf.name} isn't a PDF. Save or print it as a PDF first.`);
    const big = picked.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) return setError(`${big.name} is over ${MAX_MB} MB.`);
    setFiles((f) => [...f, ...picked].slice(0, 5));
    if (!title && picked[0]) setTitle(picked[0].name.replace(/\.pdf$/i, ""));
  }

  const setSigner = (i, k) => (e) => setSigners((list) => list.map((s, j) => (j === i ? { ...s, [k]: e.target.value } : s)));

  async function submit() {
    setError("");
    if (!files.length) return setError("Choose the PDF to send.");
    if (!title.trim()) return setError("Give it a title, like “Lease amendment: 1753 Benjamin Ave, Upper”.");
    const people = signers.filter((s) => s.name.trim() || s.email.trim());
    if (!people.length) return setError("Add at least one person to sign.");
    if (people.some((s) => !s.name.trim() || !/^\S+@\S+\.\S+$/.test(s.email.trim()))) return setError("Every signer needs a name and a valid email.");

    setBusy("upload");
    const sb = getBrowserClient();
    const uploaded = [];
    for (const f of files) {
      const path = `uploads/${randomId()}/${safe(f.name.endsWith(".pdf") ? f.name : `${f.name}.pdf`)}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, f, { contentType: "application/pdf", upsert: false });
      if (upErr) {
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
        setBusy("");
        return setError(`We couldn't upload ${f.name}. Try again.`);
      }
      uploaded.push({ path, name: f.name });
    }

    setBusy("send");
    const tab = window.open("", "_blank");
    try {
      const res = await docusignApi("/upload", {
        body: {
          files: uploaded,
          title: title.trim(),
          signers: people,
          signing_order: ordered,
          cc_irep: ccIrep,
          email_message: message,
          tenancy_id: tenancy?.id || null,
          unit_id: unit?.id || null,
          property_id: property?.id || null,
          owner_id: property?.owner_id || null,
        },
      });
      if (tab && res.url) tab.location.href = res.url;
      else tab?.close();
      refreshStaffCounts();
      router.push(`/admin/signatures/${res.id}`);
    } catch (err) {
      tab?.close();
      setError(err.message);
      setBusy("");
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="boxed stack" aria-labelledby="up-doc">
        <h2 id="up-doc" className="sec-title">
          Document
        </h2>
        <div className="field">
          <span className="label-text">
            PDF to send <span className="small">(up to {MAX_MB} MB; several PDFs are sent as one envelope)</span>
          </span>
          {files.length ? (
            <ul className="plain-list">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="file-row">
                  <span>{f.name}</span>
                  <button type="button" className="btn ghost sm" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                    Remove<span className="visually-hidden"> {f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <label className="btn ghost sm" htmlFor="up-files">
              {files.length ? "Add another PDF" : "Choose PDF"}
            </label>
            <input
              id="up-files"
              className="visually-hidden"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="up-title">Title</label>
          <input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lease amendment: 1753 Benjamin Ave, Upper" />
          <span className="small">Shown on the Signatures page and in the email subject.</span>
        </div>
      </section>

      <section className="boxed stack" aria-labelledby="up-link">
        <h2 id="up-link" className="sec-title">
          Property and Unit
        </h2>
        {!props ? (
          <p className="small">Loading properties…</p>
        ) : (
          <div className="row2">
            <div className="field">
              <label htmlFor="up-prop">Property</label>
              <select
                id="up-prop"
                value={link.property_id}
                onChange={(e) => {
                  const p = props.find((x) => x.id === e.target.value);
                  setLink({ property_id: e.target.value, unit_id: "" });
                  const only = (p?.units || []).filter((u) => !isSpecialUnit(u));
                  if (only.length === 1) pickUnit(only[0].id, p);
                }}
              >
                <option value="">Not linked</option>
                {props.map((p) => (
                  <option key={p.id} value={p.id}>
                    {propertyTitle(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="up-unit">Unit</label>
              <select id="up-unit" value={link.unit_id} onChange={(e) => pickUnit(e.target.value)} disabled={!property}>
                <option value="">Whole property / not a unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label || "Main unit"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <p className="small">
          {tenancy
            ? "Linked to the unit's current tenancy: the signed copy is filed there."
            : "The signed copy is filed with the unit or property you choose."}
        </p>
      </section>

      <section className="boxed stack" aria-labelledby="up-signers">
        <h2 id="up-signers" className="sec-title">
          Who Signs
        </h2>
        <p className="small">Filled from the current tenants and the landlord. Add or remove people as needed.</p>
        {signers.map((s, i) => (
          <div key={i} className="signer-row">
            <div className="field">
              <label htmlFor={`up-n-${i}`}>Name</label>
              <input id={`up-n-${i}`} value={s.name} onChange={setSigner(i, "name")} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor={`up-e-${i}`}>Email</label>
              <input id={`up-e-${i}`} type="email" value={s.email} onChange={setSigner(i, "email")} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor={`up-r-${i}`}>Role</label>
              <select id={`up-r-${i}`} value={ROLES.includes(s.role) ? s.role : "Other"} onChange={setSigner(i, "role")}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setSigners((l) => l.filter((_, j) => j !== i))} disabled={signers.length === 1}>
              Remove<span className="visually-hidden"> signer {i + 1}</span>
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn ghost sm" onClick={() => setSigners((l) => [...l, { name: "", email: "", role: "Tenant" }])}>
            Add a signer
          </button>
        </div>
        <label className="check-line">
          <input type="checkbox" checked={ordered} onChange={(e) => setOrdered(e.target.checked)} />
          Sign in this order (otherwise everyone gets it at the same time)
        </label>
        <label className="check-line">
          <input type="checkbox" checked={ccIrep} onChange={(e) => setCcIrep(e.target.checked)} />
          Send IRep a copy when it&apos;s signed
        </label>
        <div className="field">
          <label htmlFor="up-msg">Message in the email (optional)</label>
          <textarea id="up-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please review and sign the updated lease adding Justin as a tenant." />
        </div>
      </section>

      {error ? (
        <div className="warnbox" role="alert">
          {error}
        </div>
      ) : null}
      <div className="req-actions">
        <button type="button" className="btn primary" onClick={submit} disabled={Boolean(busy)}>
          {busy === "upload" ? "Uploading…" : busy === "send" ? "Opening DocuSign…" : "Continue in DocuSign"}
        </button>
        <span className="small">
          Opens the draft in DocuSign: drag signature, initial and date fields onto the pages for each person, then click Send.
        </span>
      </div>
    </div>
  );
}
