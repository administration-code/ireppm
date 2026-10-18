"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { SITE } from "@/lib/site";
import { shortDate } from "@/lib/rent";
import { longDate as formatLong } from "@/lib/format";

const pad = (n) => String(n).padStart(2, "0");
const EARLIER = "earlier";

// YYYY-MM-DD shifted by whole days.
function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const torontoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
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
        .select("id, kind, status, terms, created_at, completed_at")
        .in("kind", ["N9", "N11"])
        .eq("tenancy_id", home.tenancy_id)
        .order("created_at", { ascending: false }),
    ]);
    const rows = reqs.data || [];
    setState({
      loading: false,
      prep: prep.data || null,
      loadError: prep.error ? "We couldn't load this right now. Refresh the page to try again." : "",
      latest: rows.find((r) => r.kind === "N9") || null,
      latestN11: rows.find((r) => r.kind === "N11") || null,
    });
  }, [home.tenancy_id]);

  useEffect(() => {
    load();
  }, [load]);

  const { loading, prep, loadError, latest, latestN11 } = state;
  const date = latest?.terms?.termination_date;
  const names = namesOf(prep, latest);
  const n11 = prep?.n11_request || null;
  const n11Date = latestN11?.terms?.termination_date || n11?.termination_date;
  const n11DateText = n11Date ? formatLong(n11Date) : "the agreed date";

  async function cancelRequest() {
    const { error } = await getBrowserClient().rpc("cancel_n11_request", { p_id: n11.id });
    if (error) {
      setSentMsg("");
      window.alert(error.message);
      return;
    }
    setSentMsg("");
    await load();
  }

  const n9Form = prep?.ok ? (
    <N9Form
      prep={prep}
      home={home}
      user={user}
      names={names}
      onSent={async (msg) => {
        setSentMsg(msg || "Sent. Check your email from DocuSign to sign. Everyone on the lease must sign before the notice counts.");
        await load();
      }}
    />
  ) : null;

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
  } else if (latestN11 && ["sent", "delivered"].includes(latestN11.status)) {
    body = (
      <p>
        Your agreement to end the tenancy on {n11DateText} is waiting for signatures. DocuSign emailed it to everyone on
        the lease. Your landlord signs last.
      </p>
    );
  } else if (latestN11?.status === "completed") {
    body = (
      <p>
        Agreement signed. Your tenancy ends {n11DateText}. IRep will be in touch about the move-out inspection and
        keys.
      </p>
    );
  } else if (n11?.status === "requested") {
    body = (
      <div className="stack" style={{ gap: 6 }}>
        <p>
          You asked to move out on {n11DateText}. IRep is reviewing your request.
        </p>
        <div>
          <button type="button" className="linkbtn small" onClick={cancelRequest}>
            Cancel Request
          </button>
        </div>
      </div>
    );
  } else if (loadError) {
    body = <p className="mutedbox">{loadError}</p>;
  } else if (prep && !prep.ok && prep.error) {
    body = <p className="mutedbox">{prep.error}</p>;
  } else if (n11?.status === "declined") {
    body = (
      <div className="stack" style={{ gap: 14 }}>
        <div className="notebox" role="status">
          <strong>IRep couldn&apos;t agree to {n11DateText}.</strong>
          {n11.decision_note ? <span className="n11-reason">{n11.decision_note}</span> : null}
        </div>
        {n9Form}
      </div>
    );
  } else if (prep) {
    body = n9Form;
  }

  return (
    <section className="moveout" aria-labelledby={`${id}-title`}>
      <div style={{ display: "grid", gap: 2 }}>
        <h3 id={`${id}-title`}>Moving Out?</h3>
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
  const [earlyDate, setEarlyDate] = useState("");
  const [reason, setReason] = useState("");
  const [phone, setPhone] = useState(me?.phone || "");
  const [agree, setAgree] = useState(false);
  const [agreeN11, setAgreeN11] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const minEarly = addDays(torontoToday(), 1);
  const maxEarly = prep.earliest ? addDays(prep.earliest, -1) : "";
  const canGoEarlier = Boolean(maxEarly && maxEarly >= minEarly);
  const wantsEarlier = date === EARLIER;
  const earlyValid = wantsEarlier && earlyDate && earlyDate >= minEarly && earlyDate <= maxEarly;

  async function sendN11() {
    if (!agreeN11 || !earlyValid) return;
    setBusy(true);
    setError("");
    try {
      const sb = getBrowserClient();
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/tenant/n11", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenancy_id: home.tenancy_id,
          termination_date: earlyDate,
          reason: reason.trim(),
          phone: phone.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        if (json.use_n9 && dates.includes(earlyDate)) setDate(earlyDate);
        throw new Error(json.error || "The request didn't send. Try again.");
      }
      await onSent("Request sent. IRep will review it and let you know.");
    } catch (err) {
      setError(err.message || "The request didn't send. Try again.");
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (wantsEarlier) return sendN11();
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
        <select
          id={`${id}-date`}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setError("");
          }}
          required
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {longDate(d)}
            </option>
          ))}
          {canGoEarlier ? <option value={EARLIER}>An earlier date…</option> : null}
        </select>
      </div>

      {wantsEarlier ? (
        <div className="field">
          <label htmlFor={`${id}-early`}>Earlier move-out date</label>
          <input
            id={`${id}-early`}
            type="date"
            min={minEarly}
            max={maxEarly}
            value={earlyDate}
            onChange={(e) => setEarlyDate(e.target.value)}
            required
          />
        </div>
      ) : null}

      {earlyValid ? (
        <div className="notebox" role="note">
          <strong>That&apos;s sooner than an N9 notice allows.</strong>
          An N9 needs at least 60 days&apos; notice and must end on {formatLong(prep.earliest)} or later. To leave on{" "}
          {formatLong(earlyDate)}, the landlord has to agree in writing with an{" "}
          <strong style={{ display: "inline", margin: 0 }}>N11 Agreement to End the Tenancy</strong>. Send IRep a request
          below. If it&apos;s approved, everyone on the lease and then your landlord sign it in DocuSign.
        </div>
      ) : null}

      {earlyValid ? (
        <div className="field">
          <label htmlFor={`${id}-reason`}>Why do you need to move out early?</label>
          <textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={`${id}-reason-help`}
          />
          <span id={`${id}-reason-help`} className="small">
            Optional. {1000 - reason.length} characters left.
          </span>
        </div>
      ) : null}

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

      {wantsEarlier ? null : (
        <div className="stack" style={{ gap: 4 }}>
          <p>Everyone on the lease will be asked to sign:</p>
          <ul className="plain-list">
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="small">If someone&apos;s email is wrong, contact IRep before sending.</p>
        </div>
      )}

      {wantsEarlier ? (
        earlyValid ? (
          <label className="acct-check">
            <input type="checkbox" checked={agreeN11} onChange={(e) => setAgreeN11(e.target.checked)} required />
            <span>I understand IRep may decline, and that I must keep paying rent until my tenancy legally ends.</span>
          </label>
        ) : null
      ) : (
        <label className="acct-check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>I understand this is a legal notice to end my tenancy and that I must move out by this date.</span>
        </label>
      )}

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      {wantsEarlier ? (
        earlyValid ? (
          <div>
            <button type="submit" className="btn primary" disabled={busy || !agreeN11}>
              {busy ? "Sending…" : "Ask IRep to agree to this date"}
            </button>
          </div>
        ) : null
      ) : (
        <div>
          <button type="submit" className="btn primary" disabled={busy || !agree || !date}>
            {busy ? "Sending…" : "Send for signatures"}
          </button>
        </div>
      )}
    </form>
  );
}
