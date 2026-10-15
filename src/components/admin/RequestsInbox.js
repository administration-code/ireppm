"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

      <nav className="admin-tabs" aria-label="Staff sections">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin?tab=${t.key}`} scroll={false} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
            {!state.loading && counts[t.key] ? (
              <span className="tab-count">
                {counts[t.key]}
                <span className="visually-hidden"> new</span>
              </span>
            ) : null}
          </Link>
        ))}
        <Link href="/admin/listings">
          Listings
          {!state.loading && state.drafts ? (
            <span className="tab-count muted">
              {state.drafts}
              <span className="visually-hidden"> {state.drafts === 1 ? "draft" : "drafts"}</span>
            </span>
          ) : null}
        </Link>
        <Link href="/admin/maintenance">
          Maintenance
          {!state.loading && state.maintenanceNew ? (
            <span className="tab-count">
              {state.maintenanceNew}
              <span className="visually-hidden"> new</span>
            </span>
          ) : null}
        </Link>
        <Link href="/admin/rent">
          Rent
          {!state.loading && state.unmatchedPayments ? (
            <span className="tab-count">
              {state.unmatchedPayments}
              <span className="visually-hidden"> to match</span>
            </span>
          ) : null}
        </Link>
        <Link href="/admin/properties">Properties</Link>
        <Link href="/admin/owners">Owners</Link>
        <Link href="/admin/partners">Partners</Link>
        <Link href="/admin/rates">Add-ons &amp; rates</Link>
      </nav>

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
