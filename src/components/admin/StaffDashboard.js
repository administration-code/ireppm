"use client";

import { useCallback, useEffect, useState } from "react";
import NeedsAttention from "@/components/admin/dashboard/NeedsAttention";
import PayoutReminders from "@/components/admin/PayoutReminders";
import KeyNumbers from "@/components/admin/dashboard/KeyNumbers";
import RentTrendChart from "@/components/admin/dashboard/RentTrendChart";
import ArrearsTable from "@/components/admin/dashboard/ArrearsTable";
import TurnoversSummary from "@/components/admin/dashboard/TurnoversSummary";
import ComingUp from "@/components/admin/dashboard/ComingUp";
import ActivitySummaries from "@/components/admin/dashboard/ActivitySummaries";
import OpenNotices from "@/components/admin/dashboard/OpenNotices";
import { loadDashboard, updatedText } from "@/lib/dashboard";
import { monthLabel, shortDate } from "@/lib/rent";

export default function StaffDashboard() {
  const [state, setState] = useState({ loading: true, refreshing: false, data: null, error: "", at: null });
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, refreshing: true, error: "" }));
    try {
      const data = await loadDashboard();
      const at = Date.now();
      setNow(at);
      setState({ loading: false, refreshing: false, data, error: "", at });
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        refreshing: false,
        error: "We couldn't load the dashboard. Press Refresh to try again.",
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const d = state.data;

  return (
    <div className="stack dash" style={{ gap: 24 }}>
      <div className="staff-top">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="eyebrow">Staff</span>
          <h1 className="admin-title">Dashboard</h1>
          <div className="dash-refresh" style={{ flexWrap: "wrap" }}>
            <span className="small">
              {d?.today ? `${shortDate(d.today)} · ${monthLabel(d.month || d.today)}` : "Today at IRep"}
            </span>
            <span className="small" aria-live="polite">
              · {state.refreshing ? "Updating…" : updatedText(state.at, now)}
            </span>
            <button type="button" className="btn ghost sm" onClick={refresh} disabled={state.refreshing}>
              Refresh
            </button>
          </div>
        </div>

      </div>

      {state.error ? <div className="warnbox">{state.error}</div> : null}

      {state.loading ? (
        <p className="small">Loading the dashboard…</p>
      ) : d ? (
        <>
          <NeedsAttention data={d} />
          <PayoutReminders compact />
          <KeyNumbers data={d} />
          <div className="dash-grid">
            <RentTrendChart trend={d.rent_trend} />
            <ArrearsTable arrears={d.arrears} />
          </div>
          <TurnoversSummary turnovers={d.turnovers} />
          <ComingUp upcoming={d.upcoming} today={d.today} />
          <div className="dash-grid">
            <ActivitySummaries data={d} />
            <OpenNotices notices={d.notices} />
          </div>
        </>
      ) : null}
    </div>
  );
}
