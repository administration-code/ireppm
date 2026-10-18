"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";

// Drop many PayProp welcome letters at once. Each file is matched to a current tenancy by the tenant
// name in the file name (PayProp names them like "WelcomeLetter-KarthikSoman-14173-20261012.pdf").
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");

function nameFromFile(fileName) {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  const parts = base.split(/[-_ ]+/).filter((p) => !/^\d+$/.test(p) && !/^welcome ?letter$/i.test(p) && !/^welcomeletter$/i.test(p));
  return parts.join(" ");
}

function score(fileKey, person) {
  const full = norm(person.full_name);
  if (!full || !fileKey) return 0;
  if (full === fileKey) return 3;
  const words = String(person.full_name).split(/\s+/).map(norm).filter(Boolean);
  const firstLast = words.length > 1 ? words[0] + words[words.length - 1] : words[0];
  if (firstLast === fileKey) return 2.5;
  if (fileKey.includes(words[0] || "~") && fileKey.includes(words[words.length - 1] || "~")) return 2;
  if (full.includes(fileKey) || fileKey.includes(full)) return 1;
  return 0;
}

export default function PaypropLetterBulk() {
  const [tenancies, setTenancies] = useState(null);
  const [rows, setRows] = useState([]);
  const [alreadySent, setAlreadySent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getBrowserClient()
      .from("tenancies")
      .select("id, status, payprop_letter_path, unit:units(label, property:properties(address)), tenancy_tenants(full_name)")
      .in("status", ["upcoming", "active", "notice"])
      .then(({ data }) => setTenancies(data || []));
  }, []);

  const options = useMemo(
    () =>
      (tenancies || [])
        .map((t) => ({
          id: t.id,
          has: Boolean(t.payprop_letter_path),
          oldPath: t.payprop_letter_path || null,
          people: t.tenancy_tenants || [],
          label: `${(t.tenancy_tenants || []).map((p) => p.full_name).join(", ") || "Tenant"} · ${[t.unit?.property?.address, t.unit?.label].filter(Boolean).join(", ")}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tenancies]
  );

  function addFiles(list) {
    const next = [...list].map((file) => {
      const key = norm(nameFromFile(file.name));
      let best = null;
      let bestScore = 0;
      for (const o of options)
        for (const p of o.people) {
          const sc = score(key, p);
          if (sc > bestScore) {
            bestScore = sc;
            best = o.id;
          }
        }
      return { file, tenancyId: bestScore >= 2 ? best : "", guess: bestScore >= 2 ? "match" : bestScore ? "maybe" : "none", status: "" };
    });
    setRows((r) => [...r, ...next]);
  }

  async function uploadAll() {
    setBusy(true);
    setMsg("");
    const sb = getBrowserClient();
    let ok = 0;
    const out = [...rows];
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      if (!r.tenancyId || r.status === "done") continue;
      const ext = (r.file.name.split(".").pop() || "pdf").toLowerCase();
      const path = `${r.tenancyId}/payprop-welcome-letter-${Date.now()}-${i}.${ext}`;
      const up = await sb.storage.from("tenancy-documents").upload(path, r.file, { contentType: r.file.type || "application/pdf" });
      if (up.error) {
        out[i] = { ...r, status: "Upload failed" };
        continue;
      }
      const { error } = await sb
        .from("tenancies")
        .update({
          payprop_letter_path: path,
          payprop_letter_name: r.file.name,
          payprop_letter_sent_at: alreadySent ? new Date().toISOString() : null,
        })
        .eq("id", r.tenancyId);
      const old = options.find((o) => o.id === r.tenancyId)?.oldPath;
      if (!error && old && old !== path) await sb.storage.from("tenancy-documents").remove([old]);
      out[i] = { ...r, status: error ? "Saved file, but couldn't attach it" : "done" };
      if (!error) ok += 1;
      setRows([...out]);
    }
    setRows(out);
    setBusy(false);
    setMsg(`Uploaded ${ok} letter${ok === 1 ? "" : "s"}. Tenants can now see them under Paying rent in their account.`);
  }

  if (!tenancies) return <p className="small">Loading tenancies…</p>;
  const ready = rows.filter((r) => r.tenancyId && r.status !== "done").length;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <label
        className="boxed"
        style={{ display: "grid", placeItems: "center", gap: 6, padding: 32, borderStyle: "dashed", cursor: "pointer", textAlign: "center" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <b>Drop PayProp welcome letters here, or click to choose</b>
        <span className="small">PDFs. Each one is matched to a tenancy by the tenant&apos;s name in the file name. Check the matches before uploading.</span>
        <input type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </label>

      {rows.length ? (
        <>
          <div className="list table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Tenancy</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const chosen = options.find((o) => o.id === r.tenancyId);
                  return (
                    <tr key={`${r.file.name}-${i}`}>
                      <td className="small" style={{ wordBreak: "break-all" }}>{r.file.name}</td>
                      <td>
                        <select
                          aria-label={`Tenancy for ${r.file.name}`}
                          value={r.tenancyId}
                          disabled={busy || r.status === "done"}
                          onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, tenancyId: e.target.value } : y)))}
                        >
                          <option value="">Choose a tenancy…</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}{o.has ? " (has a letter)" : ""}</option>
                          ))}
                        </select>
                        {chosen?.has && r.status !== "done" ? <div className="small">This replaces the letter already on file.</div> : null}
                      </td>
                      <td>
                        {r.status === "done" ? (
                          <span className="pill st-available">Uploaded</span>
                        ) : r.status ? (
                          <span className="pill st-draft">{r.status}</span>
                        ) : r.tenancyId ? (
                          <span className="pill">{r.guess === "match" ? "Matched" : "Chosen"}</span>
                        ) : (
                          <span className="small">Needs a tenancy</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label className="check">
            <input type="checkbox" checked={alreadySent} onChange={(e) => setAlreadySent(e.target.checked)} />
            These tenants already have their letter (we emailed it or Chuck delivered it). Don&apos;t send it again.
          </label>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn primary" disabled={busy || !ready} onClick={uploadAll}>
              {busy ? "Uploading…" : `Upload ${ready} letter${ready === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="link-btn small" disabled={busy} onClick={() => setRows([])}>Clear the list</button>
          </div>
        </>
      ) : null}
      {msg ? <div className="okbox" role="status">{msg}</div> : null}
    </div>
  );
}
