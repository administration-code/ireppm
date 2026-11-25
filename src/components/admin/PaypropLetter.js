"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");
const BUCKET = "tenancy-documents";
const ALL = "__all__";

// Tap buttons: "Everyone on this tenancy" or any of the tenants.
function WhoPicker({ people, value, onChange }) {
  const everyone = value.includes(ALL);
  const toggle = (id) => {
    if (id === ALL) return onChange(everyone ? [] : [ALL]);
    const cur = value.filter((v) => v !== ALL);
    onChange(cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]);
  };
  return (
    <div className="seg" style={{ flexWrap: "wrap" }}>
      <button type="button" aria-pressed={everyone} onClick={() => toggle(ALL)}>
        Everyone on This Tenancy
      </button>
      {people.map((p) => (
        <button key={p.id} type="button" aria-pressed={!everyone && value.includes(p.id)} onClick={() => toggle(p.id)}>
          {p.full_name}
        </button>
      ))}
    </div>
  );
}

const whoFields = (value) => (value.includes(ALL) ? { for_all: true, tenant_ids: [] } : { for_all: false, tenant_ids: value });

// Staff: PayProp welcome letters for this tenancy. A shared tenancy can have one letter per tenant or
// sub-unit (e.g. Unit 1A, Unit 1B); each letter is only emailed to its own tenant(s).
export default function PaypropLetter({ tenancyId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [panel, setPanel] = useState({ id: "", kind: "" }); // kind: email | who | remove
  const [pick, setPick] = useState([]);
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(null); // a chosen file waiting for "who is it for"

  const load = useCallback(async () => {
    const res = await fetch(`/api/tenancy/payprop-letter?tenancy=${tenancyId}&list=1`, { headers: await authHeader() }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setData({ letters: json.letters || [], people: json.people || [] });
  }, [tenancyId]);
  useEffect(() => {
    load();
  }, [load]);

  const close = () => {
    setPanel({ id: "", kind: "" });
    setPending(null);
    setPick([]);
    setLabel("");
  };

  function choose(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setMsg({ kind: "err", text: "That file is over 10 MB." });
    setMsg({ kind: "", text: "" });
    setPanel({ id: "", kind: "" });
    setPending(file);
    setPick(data.letters.length ? [] : [ALL]);
    setLabel("");
  }

  async function saveNew() {
    if (!pick.length) return setMsg({ kind: "err", text: "Choose who this letter is for." });
    setBusy("upload");
    const sb = getBrowserClient();
    const ext = (pending.name.split(".").pop() || "pdf").toLowerCase();
    const path = `${tenancyId}/payprop-welcome-letter-${Date.now()}.${ext}`;
    const up = await sb.storage.from(BUCKET).upload(path, pending, { contentType: pending.type || "application/pdf" });
    if (up.error) {
      setBusy("");
      return setMsg({ kind: "err", text: "The upload didn't work. Try again." });
    }
    const { error } = await sb.from("payprop_letters").insert({ tenancy_id: tenancyId, path, file_name: pending.name, label: label.trim() || null, ...whoFields(pick) });
    if (!error) await sb.from("tenancies").update({ payprop_letter_path: path, payprop_letter_name: pending.name, payprop_letter_sent_at: null }).eq("id", tenancyId);
    setBusy("");
    setMsg(
      error
        ? { kind: "err", text: /payprop_letters/.test(error.message) ? "Run migration 0098 first, then upload again." : "Saved the file but couldn't add the letter. Try again." }
        : { kind: "ok", text: "Uploaded. The tenant(s) it's for can see it in their account." }
    );
    close();
    load();
  }

  async function saveWho(l) {
    if (!pick.length) return setMsg({ kind: "err", text: "Choose who this letter is for." });
    setBusy(l.id);
    const { error } = await getBrowserClient().from("payprop_letters").update({ label: label.trim() || null, ...whoFields(pick) }).eq("id", l.id);
    setBusy("");
    setMsg(error ? { kind: "err", text: "That didn't save. Try again." } : { kind: "ok", text: "Saved." });
    close();
    load();
  }

  async function remove(l) {
    setBusy(l.id);
    const sb = getBrowserClient();
    const { data: row } = await sb.from("payprop_letters").select("path").eq("id", l.id).maybeSingle();
    const { error } = await sb.from("payprop_letters").delete().eq("id", l.id);
    if (!error && row?.path) await sb.storage.from(BUCKET).remove([row.path]);
    if (!error) {
      const { data: rest } = await sb.from("payprop_letters").select("path, file_name, sent_at").eq("tenancy_id", tenancyId).order("created_at", { ascending: false }).limit(1);
      const n = rest?.[0];
      await sb.from("tenancies").update({ payprop_letter_path: n?.path || null, payprop_letter_name: n?.file_name || null, payprop_letter_sent_at: n?.sent_at || null }).eq("id", tenancyId);
    }
    setBusy("");
    setMsg(error ? { kind: "err", text: "That didn't remove. Try again." } : { kind: "ok", text: "Letter removed." });
    close();
    load();
  }

  async function send(l) {
    if (!pick.length) return setMsg({ kind: "err", text: "Choose at least one person to email." });
    setBusy(l.id);
    setMsg({ kind: "", text: "" });
    const res = await fetch("/api/tenancy/payprop-letter", {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ letter: l.id, to: pick }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    setMsg(res.ok ? { kind: "ok", text: `Emailed to ${json.to?.join(", ")}.` } : { kind: "err", text: json.error || "That didn't send." });
    if (res.ok) close();
    load();
  }

  async function view(l) {
    const win = window.open("", "_blank");
    const res = await fetch(`/api/tenancy/payprop-letter?letter=${l.id}`, { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    if (json.url && win) win.location = json.url;
    else {
      win?.close();
      setMsg({ kind: "err", text: json.error || "We couldn't open it." });
    }
  }

  if (!data) return null;
  const { letters, people } = data;
  const nameOf = (id) => people.find((p) => p.id === id)?.full_name || "Former tenant";

  return (
    <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>PayProp Welcome Letters</h3>
          <p className="small" style={{ margin: 0 }}>
            {letters.length
              ? "Each letter only goes to the tenant(s) it's for. Upload another for a second tenant or sub-unit; it won't replace the others."
              : "Generate it in PayProp, then upload it here. Shared homes can have one letter per tenant or sub-unit."}
          </p>
        </div>
        {!pending ? (
          <label className="btn ghost sm" style={{ cursor: "pointer" }}>
            {letters.length ? "Upload Another Letter" : "Upload Letter"}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              hidden
              disabled={Boolean(busy)}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>

      {pending ? (
        <div className="boxed stack" style={{ gap: 8 }}>
          <b>{pending.name}</b>
          <span className="small">Who is this letter for?</span>
          <WhoPicker people={people} value={pick} onChange={setPick} />
          <label className="small">
            Name it (optional, e.g. Unit 1A)
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          </label>
          <div className="req-actions">
            <button type="button" className="btn primary sm" disabled={busy === "upload"} onClick={saveNew}>
              {busy === "upload" ? "Uploading…" : "Save Letter"}
            </button>
            <button type="button" className="link-btn small" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {letters.map((l) => {
        const own = l.for_all ? people : people.filter((p) => (l.tenant_ids || []).includes(p.id));
        const unassigned = !l.for_all && !(l.tenant_ids || []).length;
        const open = panel.id === l.id ? panel.kind : "";
        return (
          <div key={l.id} className="boxed stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <b>{l.label || l.file_name || "PayProp letter (file name not saved)"}</b>
                <p className="small" style={{ margin: 0 }}>
                  {unassigned ? (
                    <span className="err">Not assigned yet: choose who it&apos;s for before emailing it.</span>
                  ) : l.for_all ? (
                    `For everyone on this tenancy (${people.map((p) => p.full_name).join(", ")})`
                  ) : (
                    `For ${(l.tenant_ids || []).map(nameOf).join(" and ")}`
                  )}
                  {" · "}
                  {l.sent_at ? `emailed ${when(l.sent_at)}${(l.sent_to || []).length ? ` to ${l.sent_to.join(", ")}` : ""}` : "not emailed yet"}
                </p>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn ghost sm" onClick={() => view(l)}>
                  View
                </button>
                {!unassigned ? (
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      setPending(null);
                      setPanel({ id: l.id, kind: "email" });
                      setPick(own.filter((p) => p.email).map((p) => p.email.toLowerCase()));
                    }}
                  >
                    {l.sent_at ? "Email Again" : "Email Letter"}
                  </button>
                ) : null}
                {!l.legacy ? (
                  <>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setPending(null);
                        setPanel({ id: l.id, kind: "who" });
                        setPick(l.for_all ? [ALL] : l.tenant_ids || []);
                        setLabel(l.label || "");
                      }}
                    >
                      Who It&apos;s For
                    </button>
                    <button type="button" className="link-btn small" onClick={() => setPanel({ id: l.id, kind: "remove" })}>
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {open === "email" ? (
              <div className="stack" style={{ gap: 8 }}>
                <span className="small">Send to:</span>
                <div className="seg" style={{ flexWrap: "wrap" }}>
                  {own.map((p) =>
                    p.email ? (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={pick.includes(p.email.toLowerCase())}
                        onClick={() => {
                          const e = p.email.toLowerCase();
                          setPick(pick.includes(e) ? pick.filter((x) => x !== e) : [...pick, e]);
                        }}
                      >
                        {p.full_name} ({p.email})
                      </button>
                    ) : null
                  )}
                </div>
                {own.some((p) => !p.email) ? (
                  <span className="small">No email on file for {own.filter((p) => !p.email).map((p) => p.full_name).join(", ")}.</span>
                ) : null}
                <div className="req-actions">
                  <button type="button" className="btn primary sm" disabled={busy === l.id || !pick.length} onClick={() => send(l)}>
                    {busy === l.id ? "Sending…" : "Send"}
                  </button>
                  <button type="button" className="link-btn small" onClick={close}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {open === "who" ? (
              <div className="stack" style={{ gap: 8 }}>
                <span className="small">Who is this letter for?</span>
                <WhoPicker people={people} value={pick} onChange={setPick} />
                <label className="small">
                  Name it (optional, e.g. Unit 1A)
                  <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
                </label>
                <div className="req-actions">
                  <button type="button" className="btn primary sm" disabled={busy === l.id} onClick={() => saveWho(l)}>
                    Save
                  </button>
                  <button type="button" className="link-btn small" onClick={close}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {open === "remove" ? (
              <div className="warnbox stack" style={{ gap: 8 }}>
                <span>Remove this letter? The file is deleted and the tenant won&apos;t see it in their account any more. This can&apos;t be undone.</span>
                <div className="req-actions">
                  <button type="button" className="btn primary sm" disabled={busy === l.id} onClick={() => remove(l)}>
                    Yes, Remove It
                  </button>
                  <button type="button" className="link-btn small" onClick={close}>
                    Keep It
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {msg.text ? (
        <p className={msg.kind === "err" ? "err" : "small"} role="status">
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
