"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { MERGE_FIELDS } from "@/lib/email-merge";
import EmailTabs from "./EmailTabs";

// Staff: edit the email templates. Merge fields in {{double braces}} are filled from the tenancy or landlord.
export default function TemplatesEditor() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState("");
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState("");

  async function load() {
    const { data } = await getBrowserClient().from("email_templates").select("*").order("sort_order");
    setRows(data || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(t) {
    const d = draft[t.key];
    const { data: u } = await getBrowserClient().auth.getUser();
    const { error } = await getBrowserClient()
      .from("email_templates")
      .update({ name: d.name, subject: d.subject, body: d.body, updated_by: u?.user?.id || null, updated_at: new Date().toISOString() })
      .eq("key", t.key);
    setMsg(error ? error.message : `Saved “${d.name}”.`);
    setOpen("");
    load();
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <EmailTabs title="Email Templates" subtitle="Edit the wording. Merge fields like {{tenant_first_names}} are filled in when you create a draft." />
      <details className="boxed">
        <summary>
          <b>Merge fields</b>
        </summary>
        <ul className="plain-list small" style={{ marginTop: 8 }}>
          {Object.entries(MERGE_FIELDS).map(([k, v]) => (
            <li key={k}>
              <code>{`{{${k}}}`}</code>: {v}
            </li>
          ))}
        </ul>
      </details>
      {msg ? <div className="okbox">{msg}</div> : null}
      {(rows || []).map((t) => (
        <section key={t.key} className="boxed stack">
          <div className="req-top">
            <b>{t.name}</b>
            <span className="small">{t.audience === "landlord" ? "For landlords" : t.audience === "any" ? "Tenants or landlords" : "For tenants"}</span>
          </div>
          {open === t.key ? (
            <>
              <div className="field">
                <label htmlFor={`tn-${t.key}`}>Name</label>
                <input id={`tn-${t.key}`} value={draft[t.key].name} onChange={(e) => setDraft((s) => ({ ...s, [t.key]: { ...s[t.key], name: e.target.value } }))} />
              </div>
              <div className="field">
                <label htmlFor={`ts-${t.key}`}>Subject</label>
                <input id={`ts-${t.key}`} value={draft[t.key].subject} onChange={(e) => setDraft((s) => ({ ...s, [t.key]: { ...s[t.key], subject: e.target.value } }))} />
              </div>
              <div className="field">
                <label htmlFor={`tb-${t.key}`}>Message</label>
                <textarea id={`tb-${t.key}`} rows={14} value={draft[t.key].body} onChange={(e) => setDraft((s) => ({ ...s, [t.key]: { ...s[t.key], body: e.target.value } }))} />
              </div>
              <div className="req-actions">
                <button type="button" className="btn primary sm" onClick={() => save(t)}>
                  Save Template
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setOpen("")}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="small" style={{ margin: 0 }}>
                <b>Subject:</b> {t.subject}
              </p>
              <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{t.body.slice(0, 220)}{t.body.length > 220 ? "…" : ""}</p>
              <div>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    setDraft((s) => ({ ...s, [t.key]: { name: t.name, subject: t.subject, body: t.body } }));
                    setOpen(t.key);
                  }}
                >
                  Edit
                </button>
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
