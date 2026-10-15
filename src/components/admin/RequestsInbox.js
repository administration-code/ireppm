"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StaffNav from "@/components/admin/StaffNav";
import ShowingsPanel from "@/components/admin/ShowingsPanel";
import ApplicationsPanel from "@/components/admin/ApplicationsPanel";
import InquiriesPanel from "@/components/admin/InquiriesPanel";
import { TABS, loadInbox, sortShowings } from "@/lib/admin-requests";

const replaceIn = (list, item) => list.map((x) => (x.id === item.id ? item : x));

export default function RequestsInbox() {
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some((t) => t.key === requested) ? requested : "showings";
  const [state, setState] = useState({ loading: true, showings: [], applications: [], inquiries: [], drafts: 0, error: "" });

  useEffect(() => {
    let alive = true;
    loadInbox().then(
      (data) => alive && setState({ loading: false, ...data }),
      () => alive && setState((s) => ({ ...s, loading: false, error: "We couldn't load requests. Refresh the page to try again." }))
    );
    return () => {
      alive = false;
    };
  }, []);

  const counts = {
    showings: state.showings.filter((s) => s.status === "requested").length,
    applications: state.applications.filter((a) => a.status === "submitted").length,
    inquiries: state.inquiries.filter((q) => q.status === "new").length,
  };

  const update = (key) => (item) =>
    setState((s) => {
      const next = replaceIn(s[key], item);
      return { ...s, [key]: key === "showings" ? sortShowings(next) : next };
    });

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <span className="eyebrow">Staff</span>
          <h1 className="admin-title">Requests</h1>
          <p className="small">Showing requests, rental applications and landlord inquiries from the website.</p>
        </div>
      </div>

      <StaffNav
        active={tab}
        counts={
          state.loading
            ? null
            : {
                ...counts,
                drafts: state.drafts,
                maintenanceNew: state.maintenanceNew,
                unmatchedPayments: state.unmatchedPayments,
                openTurnovers: state.openTurnovers,
              }
        }
      />

      {state.error ? <div className="warnbox">{state.error}</div> : null}

      {state.loading ? (
        <p className="small">Loading requests…</p>
      ) : tab === "showings" ? (
        <ShowingsPanel showings={state.showings} onChange={update("showings")} />
      ) : tab === "applications" ? (
        <ApplicationsPanel applications={state.applications} onChange={update("applications")} />
      ) : (
        <InquiriesPanel inquiries={state.inquiries} onChange={update("inquiries")} />
      )}
    </div>
  );
}
