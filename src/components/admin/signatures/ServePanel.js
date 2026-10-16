"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import SendButtons from "@/components/admin/signatures/SendButtons";
import SigStatus from "@/components/admin/signatures/SigStatus";
import { CERT_METHODS } from "@/lib/docusign-templates";
import { DEFAULT_DELIVERER } from "@/lib/lease-defaults";
import { docusignApi, openInTab, shortDate, todayIso } from "@/lib/signatures";

export default function ServePanel({ row, tenancy, notice, certs, onServed }) {
  const [emailing, setEmailing] = useState(false);
  const [message, setMessage] = useState({ text: "", tone: "" });
  const [f, setF] = useState({
    date_served: todayIso(),
    method: "handed",
    method_details: "",
    deliverer_name: DEFAULT_DELIVERER.name,
    deliverer_email: DEFAULT_DELIVERER.email,
    deliverer_phone: "",
  });
  const [recording, setRecording] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const tenants = tenancy?.tenancy_tenants || [];
  const property = tenancy?.unit?.property;
  const isN1 = row.kind === "N1";

  if (row.notice_id) {
    return (
      <section className="boxed stack" aria-labelledby="serve-title">
        <h2 id="serve-title" className="sub-title">
          Served
        </h2>
        <p>
          Served {notice?.served_on ? shortDate(notice.served_on) : ""}
          {notice?.service_method ? ` by ${String(notice.service_method).replace(/_/g, " ")}` : ""}
          {notice?.served_by ? ` (${notice.served_by})` : ""}.{" "}
          <Link href="/admin/notices">See notices</Link>
        </p>
        <CertList certs={certs} />
      </section>
    );
  }

  async function emailIt() {
    setEmailing(true);
    setMessage({ text: "", tone: "" });
    try {
      const res = await docusignApi(`/requests/${row.id}/serve-email`);
      setMessage({ text: `Emailed to ${res.sent_to.join(", ")} and recorded as served.`, tone: "ok" });
      await onServed();
    } catch (err) {
      setMessage({ text: err.message, tone: "err" });
    } finally {
      setEmailing(false);
    }
  }

  async function record(e) {
    e.preventDefault();
    setRecording(true);
    setMessage({ text: "", tone: "" });
    const { error } = await getBrowserClient().rpc("record_notice_service", {
      p_request_id: row.id,
      p_served_on: f.date_served,
      p_method: CERT_METHODS[f.method].notice,
      p_served_by: f.deliverer_name,
    });
    setRecording(false);
    if (error) setMessage({ text: `That didn't save: ${error.message}`, tone: "err" });
    else await onServed();
  }

  let emailBlock;
  if (!isN1) {
    emailBlock = (
      <p className="small">
        Serve N4/N5 by hand, mail slot or mail. The LTB consent form does not list notices to end a tenancy.
      </p>
    );
  } else if (!tenancy?.email_service_ok) {
    emailBlock = (
      <p className="small">No written consent to email service on file ({tenancy?.email_service_consent || "none recorded"}).</p>
    );
  } else {
    emailBlock = (
      <div className="req-actions">
        <button type="button" className="btn primary sm" disabled={emailing} onClick={emailIt}>
          {emailing ? "Emailing…" : "Email it to the tenants"}
        </button>
        <span className="small">{tenants.map((t) => t.email).filter(Boolean).join(", ")}</span>
      </div>
    );
  }

  const certForm = () => {
    if (!f.deliverer_name.trim() || !f.deliverer_email.trim()) throw new Error("Add the name and email of the person who delivered it.");
    return {
      related_request_id: row.id,
      notice_form: row.kind,
      place: [property?.address, tenancy?.unit?.label].filter(Boolean).join(", "),
      tenancy_id: row.tenancy_id,
      unit_id: row.unit_id,
      property_id: row.property_id,
      owner_id: row.owner_id,
      street_address: property?.address || "",
      unit_label: tenancy?.unit?.label || "",
      city: property?.city || "",
      postal_code: property?.postal_code || "",
      served_by_name: f.deliverer_name,
      served_to: tenants.map((t) => t.full_name).filter(Boolean),
      ...f,
    };
  };

  return (
    <section className="boxed stack" aria-labelledby="serve-title">
      <h2 id="serve-title" className="sub-title">
        Serve this notice
      </h2>
      {message.text ? (
        <div className={message.tone === "ok" ? "okbox" : "warnbox"} role="status">
          {message.text}
        </div>
      ) : null}

      <div className="stack" style={{ gap: 8 }}>
        <h3 className="small" style={{ fontWeight: 700, color: "var(--fg)" }}>
          Email it to the tenants
        </h3>
        {emailBlock}
      </div>

      <form className="stack" onSubmit={record}>
        <h3 className="small" style={{ fontWeight: 700, color: "var(--fg)" }}>
          Hand delivery, mail slot or mail
        </h3>
        <div className="req-actions">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() =>
              openInTab(async () => (await docusignApi(`/requests/${row.id}`, { body: { action: "file", which: "signed" } })).url).catch((err) =>
                setMessage({ text: err.message, tone: "err" })
              )
            }
          >
            Download signed PDF
          </button>
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor="sv-date">Date served</label>
            <input id="sv-date" type="date" value={f.date_served} onChange={set("date_served")} required />
          </div>
          <div className="field">
            <label htmlFor="sv-method">Method</label>
            <select id="sv-method" value={f.method} onChange={set("method")}>
              {Object.entries(CERT_METHODS).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sv-by">Served by</label>
            <input id="sv-by" value={f.deliverer_name} onChange={set("deliverer_name")} required />
          </div>
        </div>
        {f.method === "other" ? (
          <div className="field">
            <label htmlFor="sv-other">How it was served</label>
            <input id="sv-other" value={f.method_details} onChange={set("method_details")} />
          </div>
        ) : null}
        <div className="row2">
          <div className="field">
            <label htmlFor="sv-email">Their email (signs the certificate)</label>
            <input id="sv-email" type="email" value={f.deliverer_email} onChange={set("deliverer_email")} />
          </div>
          <div className="field">
            <label htmlFor="sv-phone">Their phone</label>
            <input id="sv-phone" type="tel" value={f.deliverer_phone} onChange={set("deliverer_phone")} />
          </div>
        </div>
        <SendButtons kind="certificate_of_service" getForm={certForm} />
        <div className="req-actions">
          <button type="submit" className="btn ghost sm" disabled={recording}>
            {recording ? "Saving…" : "Record service"}
          </button>
          <span className="small">Records the date, method and who served it, and adds it to the notices list.</span>
        </div>
      </form>
      <CertList certs={certs} />
    </section>
  );
}

function CertList({ certs }) {
  if (!certs?.length) return null;
  return (
    <ul className="sig-docs">
      {certs.map((c) => (
        <li key={c.id}>
          <Link href={`/admin/signatures/${c.id}`}>{c.title}</Link>
          <SigStatus status={c.status} />
        </li>
      ))}
    </ul>
  );
}
