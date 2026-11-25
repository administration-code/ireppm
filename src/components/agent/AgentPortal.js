"use client";

import { ContactGuideCard } from "@/components/contact/ContactGuide";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";
import { GettingStarted } from "@/components/tenant/TenantCards";
import AgentMaintenanceForm from "./AgentMaintenanceForm";
import AgentJobDone from "./AgentJobDone";
import PushToggle from "@/components/PushToggle";

const longDay = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { weekday: "short", month: "long", day: "numeric" }) : "";
const STATUS = { requested: "Needs your answer", rescheduled: "Waiting for the renter", confirmed: "Confirmed" };
const ROLE = { showings: "Showings", maintenance: "Maintenance", lawn_snow: "Lawn & snow" };

// Contractors and showing agents: their properties, showings to answer and open jobs.
export default function AgentPortal() {
  const { user, ready, openSignIn } = useAuth();
  const [state, setState] = useState({ loading: true, data: null });
  const [tour, setTour] = useState({ loaded: false, dismissedAt: null });
  const [cash, setCash] = useState(null);
  const [serve, setServe] = useState(null);
  const [doneJobs, setDoneJobs] = useState([]);
  const [bookings, setBookings] = useState({});
  const [inspDue, setInspDue] = useState(0);
  const [tasks, setTasks] = useState(0);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const res = await fetch("/api/agent/tasks", { headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } }).catch(() => null);
      const out = res ? await res.json().catch(() => null) : null;
      if (Array.isArray(out?.tasks)) setTasks(out.tasks.length);
    })();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const res = await fetch("/api/agent/maintenance/done", { headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } }).catch(() => null);
      const out = res ? await res.json().catch(() => null) : null;
      if (Array.isArray(out?.done)) setDoneJobs(out.done);
      if (out?.bookings) setBookings(out.bookings);
      if (typeof out?.inspectionsDue === "number") setInspDue(out.inspectionsDue);
    })();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const res = await fetch("/api/agent/notices", { headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } }).catch(() => null);
      const out = res ? await res.json().catch(() => null) : null;
      if (out?.allowed) setServe({ count: out.toServe.length + out.toSign.length, late: out.toServe.some((n) => n.late) });
    })();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const res = await fetch("/api/agent/cash", { headers: { Authorization: `Bearer ${data?.session?.access_token || ""}` } }).catch(() => null);
      const out = res ? await res.json().catch(() => null) : null;
      if (out?.allowed) setCash({ held: out.held.length, total: out.held.reduce((s, c) => s + Number(c.amount), 0) });
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getBrowserClient()
      .from("profiles")
      .select("tour_dismissed_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setTour({ loaded: true, dismissedAt: data?.tour_dismissed_at || null }));
  }, [user]);

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
        <Link className="btn primary" href="/agent/help" style={{ width: "fit-content", fontSize: "1.05rem" }}>
          Help: What Do I Do?
        </Link>
        <div className="req-actions">
          <Link className={`btn ${tasks ? "primary" : "ghost"} sm`} href="/agent/tasks">
            {tasks ? `Tasks From the Office (${tasks})` : "Tasks From the Office"}
          </Link>
          {serve ? (
            <Link className={`btn ${serve.count ? "primary" : "ghost"} sm`} href="/agent/notices">
              {serve.count ? `Notices to Serve (${serve.count})${serve.late ? " · late" : ""}` : "Notices to Serve"}
            </Link>
          ) : null}
          {cash ? (
            <Link className="btn primary sm" href="/agent/cash">
              {cash.held ? `Cash (holding $${cash.total.toFixed(2)})` : "Log Cash"}
            </Link>
          ) : null}
          <Link className="btn primary sm" href="/agent/vacancies">
            Vacancies
          </Link>
          <Link className="btn primary sm" href="/agent/inspection">
            {inspDue ? `Inspections (${inspDue} due)` : "Inspection Report"}
          </Link>
          <Link className="btn primary sm" href="/agent/visits">
            Lawn and Snow
          </Link>
          <Link className="btn ghost sm" href="/agent/pay">
            Your pay and tax statement
          </Link>
        </div>
      </div>

      {tour.loaded ? <GettingStarted role="partner" dismissedAt={tour.dismissedAt} /> : null}

      <PushToggle />

      <section id="showings" className={`boxed stack${toAnswer.length ? " attention" : ""}`} aria-labelledby="ag-show">
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

      <AgentMaintenanceForm
        userId={user.id}
        onLogged={() => getBrowserClient().rpc("agent_portal").then(({ data }) => data && setState({ loading: false, data }))}
      />

      {d.jobs.length ? (
        <section id="jobs" className="boxed stack" aria-labelledby="ag-jobs">
          <h2 id="ag-jobs" className="sec-title">
            Open Jobs
          </h2>
          <ul className="plain-list">
            {d.jobs.map((j) => (
              <li key={j.id}>
                <b>{j.title}</b> · {j.place}
                {j.status === "new" ? <span className="small"> · waiting for IRep to review</span> : null}
                {j.scheduled_for ? ` · scheduled ${longDay(String(j.scheduled_for).slice(0, 10))}` : ""}
                {j.urgency === "emergency" ? <b className="err"> · emergency</b> : null}
                <span className="sub-line small">
                  {/Whole property/.test(j.place || "")
                    ? "Outside or shared areas, no need to enter a unit."
                    : j.permission_to_enter
                      ? "May enter if no one is home."
                      : "Arrange a time with the tenant first."}
                  {j.access_notes ? ` ${j.access_notes}` : ""}
                </span>
                {bookings[j.id] && !doneJobs.includes(j.id) ? (
                  <div className="stack" style={{ gap: 4, margin: "8px 0" }}>
                    <span className="small">Landlord approved this. Separate invoice, not taken off rent.</span>
                    <a
                      className="btn primary sm"
                      style={{ minHeight: 44, width: "fit-content" }}
                      href={`mailto:${encodeURIComponent(bookings[j.id].email)}?cc=${encodeURIComponent(SITE.email)}&subject=${encodeURIComponent(bookings[j.id].subject)}&body=${encodeURIComponent(bookings[j.id].body)}`}
                    >
                      Email the Landlord to Book It
                    </a>
                  </div>
                ) : null}
                <AgentJobDone job={j} userId={user.id} done={doneJobs.includes(j.id)} onDone={(id) => setDoneJobs((l) => [...l, id])} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Kept short: closed until he taps it. Roles only show where a property isn't one of his usual (all-role) ones. */}
      {d.properties.length ? (
        <details className="boxed">
          <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", fontWeight: 600 }}>
            Your Properties ({d.properties.length})
          </summary>
          <ul className="plain-list stack" style={{ gap: 6, marginTop: 8 }}>
            {d.properties.map((p) => {
              const roles = p.roles || [];
              const partial = roles.length < Object.keys(ROLE).length;
              return (
                <li key={p.id}>
                  {p.address}
                  {partial ? <span className="small"> · {roles.map((r) => ROLE[r] || r).join(", ")} only</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : (
        <p className="small">IRep hasn&apos;t assigned you to any properties yet.</p>
      )}
      <ContactGuideCard audience="partner" />
    </div>
  );
}
