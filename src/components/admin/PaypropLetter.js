"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");

// Staff: upload the PayProp welcome letter for this tenancy, email it to the tenants, or open it.
export default function PaypropLetter({ tenancyId }) {
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = useCallback(async () => {
    const { data } = await getBrowserClient()
      .from("tenancies")
      .select("id, payprop_letter_path, payprop_letter_name, payprop_letter_sent_at")
      .eq("id", tenancyId)
      .maybeSingle();
    setRow(data || {});
  }, [tenancyId]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setMsg({ kind: "err", text: "That file is over 10 MB." });
    setBusy("upload");
    setMsg({ kind: "", text: "" });
    const sb = getBrowserClient();
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const path = `${tenancyId}/payprop-welcome-letter-${Date.now()}.${ext}`;
    const up = await sb.storage.from("tenancy-documents").upload(path, file, { contentType: file.type || "application/pdf" });
    if (up.error) {
      setBusy("");
      return setMsg({ kind: "err", text: "The upload didn't work. Try again." });
    }
    const old = row?.payprop_letter_path;
    const { error } = await sb
      .from("tenancies")
      .update({ payprop_letter_path: path, payprop_letter_name: file.name, payprop_letter_sent_at: null })
      .eq("id", tenancyId);
    if (!error && old) await sb.storage.from("tenancy-documents").remove([old]);
    setBusy("");
    setMsg(error ? { kind: "err", text: "Saved the file but couldn't attach it to the tenancy. Try again." } : { kind: "ok", text: "Uploaded. Tenants can now see it in their account." });
    load();
  }

  async function send() {
    setBusy("send");
    setMsg({ kind: "", text: "" });
    const res = await fetch("/api/tenancy/payprop-letter", {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ tenancy: tenancyId }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    setMsg(res.ok ? { kind: "ok", text: `Emailed to ${json.to?.join(", ")}.` } : { kind: "err", text: json.error || "That didn't send." });
    load();
  }

  async function view() {
    const res = await fetch(`/api/tenancy/payprop-letter?tenancy=${tenancyId}`, { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    if (json.url) window.open(json.url, "_blank", "noopener");
    else setMsg({ kind: "err", text: json.error || "We couldn't open it." });
  }

  if (!row) return null;
  const has = Boolean(row.payprop_letter_path);
  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>PayProp Welcome Letter</h3>
          <p className="small" style={{ margin: 0 }}>
            {has
              ? `${row.payprop_letter_name || "Letter"} · ${row.payprop_letter_sent_at ? `emailed ${when(row.payprop_letter_sent_at)}` : "not emailed yet"}`
              : "Generate it in PayProp, then upload it here. Tenants see it in their account."}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {has ? (
            <>
              <button type="button" className="btn ghost sm" onClick={view}>View</button>
              <button type="button" className="btn primary sm" disabled={Boolean(busy)} onClick={send}>
                {busy === "send" ? "Sending…" : row.payprop_letter_sent_at ? "Email again" : "Email to tenants"}
              </button>
            </>
          ) : null}
          <label className="btn ghost sm" style={{ cursor: "pointer" }}>
            {busy === "upload" ? "Uploading…" : has ? "Replace" : "Upload letter"}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              hidden
              disabled={Boolean(busy)}
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {msg.text ? <p className={msg.kind === "err" ? "err" : "small"} role="status">{msg.text}</p> : null}
    </div>
  );
}
