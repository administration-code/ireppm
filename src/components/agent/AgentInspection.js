"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import InspectionReportForm from "@/components/InspectionReportForm";

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

// Vendors fill in an inspection report for one of their properties.
export default function AgentInspection() {
  const { user, ready, openSignIn } = useAuth();
  const [props, setProps] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const res = await fetch("/api/agent/inspections", { headers: await authHeader() });
      const json = await res.json().catch(() => ({}));
      setProps(res.ok ? json.properties || [] : []);
    })();
  }, [user]);

  if (!ready) return <p className="small">Loading…</p>;
  if (!user)
    return (
      <div className="empty">
        <h1>Inspection Report</h1>
        <button type="button" className="btn primary" onClick={() => openSignIn("/agent/inspection")}>
          Sign in
        </button>
      </div>
    );
  if (!props) return <p className="small">Loading your properties…</p>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <Link className="back" href="/agent">
          ← Agent Portal
        </Link>
        <span className="eyebrow">Agent Portal</span>
        <h1 className="admin-title">Inspection Report</h1>
      </div>
      {done ? (
        <div className="okbox stack" role="status">
          <p style={{ margin: 0 }}>Thanks, IRep has your report. We&apos;ll review it and send the improvements to the landlord.</p>
          <div className="req-actions">
            <button type="button" className="btn ghost sm" onClick={() => setDone(false)}>
              Start another report
            </button>
            <Link className="btn ghost sm" href="/agent">
              Back to the portal
            </Link>
          </div>
        </div>
      ) : !props.length ? (
        <p className="small">IRep hasn&apos;t assigned you to any properties yet.</p>
      ) : (
        <InspectionReportForm
          properties={props}
          onSubmit={async (form) => {
            const res = await fetch("/api/agent/inspections", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(await authHeader()) },
              body: JSON.stringify(form),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || "That didn't save. Try again.");
            window.scrollTo(0, 0);
            setDone(true);
          }}
        />
      )}
    </div>
  );
}
