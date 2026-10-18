"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { docusignApi, openInTab } from "@/lib/signatures";

export default function TemplatesCheck() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    docusignApi("/templates", { method: "GET" })
      .then((d) => setState({ loading: false, templates: d.templates }))
      .catch((err) => setState({ loading: false, error: err.message, consentRequired: err.consentRequired }));
  }, []);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin/signatures">
          ← Signatures
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Signatures</span>
            <h1 className="admin-title">DocuSign Templates</h1>
            <p className="small">Each template&apos;s roles and field labels, checked against what the app fills in.</p>
          </div>
        </div>
      </div>

      {state.loading ? <p className="small">Checking DocuSign…</p> : null}
      {state.error ? (
        <div className="warnbox stack" style={{ gap: 8 }}>
          <span>{state.error}</span>
          {state.consentRequired ? (
            <button
              type="button"
              className="btn primary sm"
              style={{ justifySelf: "start" }}
              onClick={() => openInTab(async () => (await docusignApi("/consent", { method: "GET" })).url)}
            >
              Grant DocuSign consent
            </button>
          ) : null}
        </div>
      ) : null}

      {(state.templates || []).map((t) => {
        const problems = (t.missingRoles?.length || 0) + (t.missingLabels?.length || 0);
        return (
          <section key={t.key} className="boxed stack" aria-labelledby={`tpl-${t.key}`}>
            <div className="sec-head">
              <h2 id={`tpl-${t.key}`} className="sub-title">
                {t.names?.[0] || t.key}
              </h2>
              <span className={`pill ${!t.id ? "sig-bad" : problems ? "sig-wait" : "sig-ok"}`}>
                {!t.id ? "Not found" : problems ? `${problems} missing` : "All good"}
              </span>
            </div>
            {!t.id ? (
              <p className="small">No template in DocuSign matches {t.names?.map((n) => `"${n}"`).join(" or ")}.</p>
            ) : (
              <>
                {t.missingRoles?.length ? <p className="small err">Missing roles: {t.missingRoles.join(", ")}</p> : null}
                {t.missingLabels?.length ? (
                  <div className="small err">
                    Missing field labels:
                    <ul className="sig-missing">
                      {t.missingLabels.map((m) => (
                        <li key={`${m.role}-${m.label}`}>
                          {m.role}: {m.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {t.roles.map((r) => (
                  <details key={r.role}>
                    <summary>
                      {r.role || "(no role name)"} · {r.labels.length} labels
                    </summary>
                    <p className="small sig-labels">{r.labels.join(", ") || "No labelled fields."}</p>
                  </details>
                ))}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
