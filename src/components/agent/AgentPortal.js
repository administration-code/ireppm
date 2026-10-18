"use client";

import { useLiveRefresh } from "@/lib/useLiveRefresh";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";

const longDay = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { weekday: "short", month: "long", day: "numeric" }) : "";
const STATUS = { requested: "Needs your answer", rescheduled: "Waiting for the renter", confirmed: "Confirmed" };
const ROLE = { showings: "Showings", maintenance: "Maintenance", lawn_snow: "Lawn & snow" };

// Contractors and showing agents: their properties, showings to answer and open jobs.
export default function AgentPortal() {
  const { user, ready, openSignIn } = useAuth();
  const [state, setState] = useState({ loading: true, data: null });

  useLiveRefresh(() => user && getBrowserClient().rpc("agent_portal").then(({ data }) => data && setState({ loading: false, data })), 60000);

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    getBrowserClient()
      .rpc("agent_portal")
      .then(({ data }) => alive && setState({ loading: false, data }));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!ready) return <p className="small">Loading…</p>;
  if (!user) {
    return (
      <div className="empty">
        <h1>Agent Portal</h1>
        <p>For IRep&apos;s showing agents and contractors. Sign in with the email address IRep has on file for you.</p>
        <button type="button" className="btn primary" onClick={() => openSignIn("/agent")}>
          Sign in
        </button>
      </div>
    );
  }
  if (state.loading) return <p className="small">Loading…</p>;
  const d = state.data;
  if (!d) {
    return (
      <div className="empty">
        <h1>Agent Portal</h1>
        <p>
          We couldn&apos;t find an agent record for {user.email}. Ask IRep to add this email to your partner record, or contact{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>
      </div>
    );
  }

  const toAnswer = d.showings.filter((s) => s.status === "requested");
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">Agent Portal</span>
        <h1 className="admin-title">Hi {String(d.partner.name || "").split(" ")[0]}</h1>
      </div>

      <section className={`boxed stack${toAnswer.length ? " attention" : ""}`} aria-labelledby="ag-show">
        <h2 id="ag-show" className="sec-title">
          Showings{toAnswer.length ? ` (${toAnswer.length} to answer)` : ""}
        </h2>
        {d.showings.length ? (
          <ul className="req-list">
            {d.showings.map((s) => (
              <li className="req" key={s.id}>
                <div className="req-top">
                  <div className="req-who">
                    <h3>{s.place}</h3>
                    <p className="small" style={{ margin: 0 }}>
                      {longDay(s.preferred_date)}, {s.preferred_time}
                      {s.status === "rescheduled" && s.proposed_date ? ` · you suggested ${longDay(s.proposed_date)}, ${s.proposed_time}` : ""}
                    </p>
                    <p className="small" style={{ margin: 0 }}>
                      {s.renter || "Renter"}
                      {s.renter_phone ? (
                        <>
                          {" · "}
                          <a href={`tel:${s.renter_phone}`}>{s.renter_phone}</a>
                        </>
                      ) : null}
                      {" · "}
                      {s.vacant ? "Vacant" : "Occupied: tenants get written notice when you approve"}
                    </p>
                  </div>
                  <span className={`pill ${s.status === "confirmed" ? "rs-confirmed" : "rs-requested"}`}>{STATUS[s.status]}</span>
                </div>
                {s.notes ? <p className="req-note">{s.notes}</p> : null}
                {s.token ? (
                  <div className="req-actions">
                    <Link className={`btn ${s.status === "requested" ? "primary" : "ghost"} sm`} href={`/showings/respond?t=${s.token}`}>
                      {s.status === "requested" ? "Approve, decline or suggest a time" : "Change or decline"}
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">No upcoming showings.</p>
        )}
      </section>

      {d.jobs.length ? (
        <section className="boxed stack" aria-labelledby="ag-jobs">
          <h2 id="ag-jobs" className="sec-title">
            Open Jobs
          </h2>
          <ul className="plain-list">
            {d.jobs.map((j) => (
              <li key={j.id}>
                <b>{j.title}</b> · {j.place}
                {j.scheduled_for ? ` · scheduled ${longDay(String(j.scheduled_for).slice(0, 10))}` : ""}
                {j.urgency === "emergency" ? <b className="err"> · emergency</b> : null}
                <span className="sub-line small">
                  {j.permission_to_enter ? "May enter if no one is home." : "Arrange a time with the tenant first."}
                  {j.access_notes ? ` ${j.access_notes}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="boxed stack" aria-labelledby="ag-props">
        <h2 id="ag-props" className="sec-title">
          Your Properties
        </h2>
        {d.properties.length ? (
          <ul className="plain-list">
            {d.properties.map((p) => (
              <li key={p.id}>
                {p.address}
                {p.city ? `, ${p.city}` : ""}
                <span className="small"> · {(p.roles || []).map((r) => ROLE[r] || r).join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">IRep hasn&apos;t assigned you to any properties yet.</p>
        )}
      </section>
    </div>
  );
}
