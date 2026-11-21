"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import AppFileButton from "@/components/AppFileButton";

const KINDS = { photo_id: "Photo ID", proof_of_income: "Proof of income", bank_statement: "Bank statement", other: "Other sensitive document" };
const VIA = { text: "Text message", whatsapp: "WhatsApp", email: "Email", in_person: "In person", other: "Other" };
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.webp";

async function api(method, body, query = "") {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(`/api/sensitive-docs${query}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "That didn't work. Try again.");
  return out;
}
const day = (iso) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

// Staff: ID and sensitive documents received by text, WhatsApp or email, saved to an applicant's or
// tenant's file. Only "ID verified by <staff> on <date>" is kept about the ID itself, never its number.
export default function SensitiveDocs({ applicationId, tenancyId }) {
  const target = applicationId ? { application_id: applicationId } : { tenancy_id: tenancyId };
  const query = applicationId ? `?application=${applicationId}` : `?tenancy=${tenancyId}`;
  const [state, setState] = useState(null);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("photo_id");
  const [via, setVia] = useState("text");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [reminder, setReminder] = useState(null);

  async function load() {
    try {
      setState(await api("GET", null, query));
    } catch (e) {
      setState({ docs: [], views: [], error: e.message });
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, tenancyId]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const meta = { ...target, file_name: file.name, type: file.type, size: file.size };
      const prep = await api("POST", { action: "prepare", ...meta });
      const put = await fetch(prep.upload_url, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!put.ok) throw new Error("The file didn't upload. Try again.");
      const saved = await api("POST", { action: "save", ...meta, path: prep.path, kind, label: label || KINDS[kind], received_via: via });
      setReminder({ id: saved.id, via });
      setFile(null);
      setLabel("");
      load();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }
  async function act(action, id) {
    if (action === "delete" && !window.confirm("Delete this file permanently? It can't be recovered.")) return;
    try {
      await api("POST", { action, id, ...target });
      if (action === "original_deleted" && reminder?.id === id) setReminder(null);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }
  async function view(id) {
    const tab = window.open("about:blank", "_blank");
    try {
      const { url } = await api("GET", null, `?view=${id}`);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      }
    } catch (e) {
      tab?.close();
      setMsg(e.message);
    }
  }

  return (
    <section className="stack" style={{ gap: 10 }}>
      <h3 className="eyebrow" style={{ margin: 0 }}>
        ID and Sensitive Documents
      </h3>
      {reminder ? (
        <div className="notice" role="alert" style={{ border: "2px solid var(--red)", padding: 12, borderRadius: "var(--radius)" }}>
          <b>Now delete the original from the {reminder.via === "whatsapp" ? "WhatsApp chat" : reminder.via === "text" ? "text messages" : reminder.via === "email" ? "email" : "email/chat"}.</b>
          <div className="req-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn sm" onClick={() => act("original_deleted", reminder.id)}>
              Done, I Deleted It
            </button>
          </div>
        </div>
      ) : null}
      <p className="small" style={{ margin: 0 }}>
        {state?.verified ? (
          <>
            ✓ ID verified by {state.verified.by} on {day(state.verified.on)}.
          </>
        ) : (
          <>ID not verified yet. </>
        )}{" "}
        {!state?.verified ? (
          <button type="button" className="link-btn small" onClick={() => act("verify_id")}>
            Mark ID Verified
          </button>
        ) : null}{" "}
        Never write down ID or licence numbers.
      </p>
      {(state?.docs || []).length ? (
        <ul className="doc-list">
          {state.docs.map((d) => (
            <li key={d.id}>
              <span className="doc-name">
                <b>{d.label}</b>
                <span className="small">
                  {KINDS[d.kind]} · by {VIA[d.received_via]?.toLowerCase()} · saved {day(d.uploaded_at)} by {d.uploaded_by_name}
                  {d.original_deleted_at ? " · original deleted" : ""}
                </span>
                {!d.original_deleted_at ? (
                  <span className="small" style={{ color: "var(--red)" }}>
                    Original not deleted yet.{" "}
                    <button type="button" className="link-btn small" onClick={() => act("original_deleted", d.id)}>
                      I deleted it
                    </button>
                  </span>
                ) : null}
              </span>
              <span className="req-actions">
                {applicationId ? (
                  <AppFileButton appId={applicationId} doc={`sensitive:${d.id}`} label="View" />
                ) : (
                  <button type="button" className="btn ghost sm" onClick={() => view(d.id)}>
                    View
                  </button>
                )}
                <button type="button" className="link-btn small" onClick={() => act("delete", d.id)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Received by" value={via} onChange={(e) => setVia(e.target.value)}>
          {Object.entries(VIA).map(([k, v]) => (
            <option key={k} value={k}>
              Received by {v.toLowerCase()}
            </option>
          ))}
        </select>
        <input aria-label="Label" placeholder="Label, e.g. Driver's licence (front)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="button" className="btn sm" disabled={!file || busy} onClick={upload}>
          {busy ? "Saving…" : "Save as Sensitive"}
        </button>
      </div>
      {applicationId ? (
        <p className="small" style={{ margin: 0 }}>
          The landlord sees these only on a secure page that expires, with a watermark and no download. They&apos;re deleted 30 days after the application is
          declined or withdrawn.
        </p>
      ) : null}
      {(state?.views || []).length ? (
        <details>
          <summary className="small">Views ({state.views.length})</summary>
          <ul className="small">
            {state.views.map((v, i) => (
              <li key={i}>
                {new Date(v.viewed_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })} · {v.viewer_role === "owner" ? "Landlord" : "Staff"}
                {v.viewer_name ? ` (${v.viewer_name})` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {msg ? (
        <p className="small err" role="alert">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
