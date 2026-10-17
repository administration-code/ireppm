"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";
import { shortDate } from "@/lib/rent";

const pad = (n) => String(n).padStart(2, "0");
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const longDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

// The earliest date, then the last day of each following rental period.
export function moveOutDates(earliest, dueDay, count = 12) {
  if (!earliest) return [];
  const due = Number(dueDay) || 1;
  const out = [earliest];
  let [y, m] = earliest.split("-").map(Number);
  for (let guard = 0; out.length < count && guard < 40; guard++) {
    const day = due === 1 ? daysIn(y, m) : Math.min(due - 1, daysIn(y, m));
    const iso = `${y}-${pad(m)}-${pad(day)}`;
    if (iso > earliest) out.push(iso);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function namesOf(prep, request) {
  const list = (prep?.tenants?.length ? prep.tenants : request?.terms?.tenants) || [];
  return list.map((t) => t.full_name || t.name).filter(Boolean);
}

export default function MovingOut({ home, user, showAddress }) {
  const id = useId();
  const [state, setState] = useState({ loading: true });
  const [sentMsg, setSentMsg] = useState("");

  const load = useCallback(async () => {
    const sb = getBrowserClient();
    const [prep, reqs] = await Promise.all([
      sb.rpc("n9_prepare", { p_tenancy_id: home.tenancy_id }),
      sb
        .from("signature_requests")
        .select("id, status, terms, created_at, completed_at")
        .eq("kind", "N9")
        .eq("tenancy_id", home.tenancy_id)
        .order("created_at", { ascending: false }),
    ]);
    setState({
      loading: false,
      prep: prep.data || null,
      loadError: prep.error ? "We couldn't load this right now. Refresh the page to try again." : "",
      latest: reqs.data?.[0] || null,
    });
  }, [home.tenancy_id]);

  useEffect(() => {
    load();
  }, [load]);

  const { loading, prep, loadError, latest } = state;
  const date = latest?.terms?.termination_date;
  const names = namesOf(prep, latest);

  let body;
  if (loading) {
    body = <p className="small">Loading…</p>;
  } else if (latest && ["sent", "delivered"].includes(latest.status)) {
    body = (
      <div className="stack" style={{ gap: 6 }}>
        <p>
          Your notice is waiting for signatures. DocuSign emailed it to: {names.join(", ") || "everyone on the lease"}.
        </p>
        {date ? <p>Moving out {longDate(date)}.</p> : null}
      </div>
    );
  } else if (latest?.status === "completed") {
    body = (
      <p>
        Notice given. Your tenancy ends {date ? longDate(date) : "on the date in your notice"}. IRep will be in touch
        about the move-out inspection and keys.
      </p>
    );
  } else if (loadError) {
    body = <p className="mutedbox">{loadError}</p>;
  } else if (prep && !prep.ok && prep.error) {
    body = <p className="mutedbox">{prep.error}</p>;
  } else if (prep) {
    body = (
      <N9Form
        prep={prep}
        home={home}
        user={user}
        names={names}
        onSent={async () => {
          setSentMsg("Sent. Check your email from DocuSign to sign. Everyone on the lease must sign before the notice counts.");
          await load();
        }}
      />
    );
  }

  return (
    <section className="moveout" aria-labelledby={`${id}-title`}>
      <div style={{ display: "grid", gap: 2 }}>
        <h3 id={`${id}-title`}>Moving out?</h3>
        {showAddress ? <p className="small">{[home.address, home.unit_label].filter(Boolean).join(", ")}</p> : null}
      </div>
      {sentMsg ? (
        <div className="okbox" role="status">
          {sentMsg}
        </div>
      ) : null}
      {body}
      <p className="small">
        Questions? Contact IRep at <a href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`}>{SITE.phone}</a> or{" "}
        <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
      </p>
    </section>
  );
}

function N9Form({ prep, home, user, names, onSent }) {
  const id = useId();
  const dates = moveOutDates(prep.earliest, prep.rent_due_day);
  const me =
    (prep.tenants || []).find((t) => t.email && user?.email && t.email.toLowerCase() === user.email.toLowerCase()) ||
    (prep.tenants || []).find((t) => t.is_primary);
  const [date, setDate] = useState(dates[0] || "");
  const [phone, setPhone] = useState(me?.phone || "");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!agree || !date) return;
    setBusy(true);
    setError("");
    try {
      const sb = getBrowserClient();
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/tenant/n9", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenancy_id: home.tenancy_id, termination_date: date, phone: phone.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "The notice didn't send. Try again.");
      await onSent();
    } catch (err) {
      setError(err.message || "The notice didn't send. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
      <p>
        To end your tenancy you need to give the landlord at least 60 days&apos; written notice (an N9 form). Your
        move-out date must be the last day of a rental period.
      </p>
      {prep.fixed_term_end ? (
        <p className="small">
          Your lease runs to {shortDate(prep.fixed_term_end)}, so the earliest date is {shortDate(prep.earliest)}.
        </p>
      ) : null}

      <div className="field">
        <label htmlFor={`${id}-date`}>Move-out date</label>
        <select id={`${id}-date`} value={date} onChange={(e) => setDate(e.target.value)} required>
          {dates.map((d) => (
            <option key={d} value={d}>
              {longDate(d)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={`${id}-phone`}>Phone number</label>
        <input
          id={`${id}-phone`}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-describedby={`${id}-phone-help`}
        />
        <span id={`${id}-phone-help`} className="small">
          This is printed on the form.
        </span>
      </div>

      <div className="stack" style={{ gap: 4 }}>
        <p>Everyone on the lease will be asked to sign:</p>
        <ul className="plain-list">
          {names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="small">If someone&apos;s email is wrong, contact IRep before sending.</p>
      </div>

      <label className="acct-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
        <span>I understand this is a legal notice to end my tenancy and that I must move out by this date.</span>
      </label>

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <button type="submit" className="btn primary" disabled={busy || !agree || !date}>
          {busy ? "Sending…" : "Send for signatures"}
        </button>
      </div>
    </form>
  );
}
