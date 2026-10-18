"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { PAYMENT_INFO } from "@/lib/payment-info";

const longDay = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }) : "";
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const daysUntil = (iso) => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${todayIso()}T12:00:00`)) / 86400000);

async function authHeader() {
  const { data } = await getBrowserClient().auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

function PaypropLetterLink({ tenancyId, label }) {
  const [available, setAvailable] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/tenancy/payprop-letter?tenancy=${tenancyId}&check=1`, { headers: await authHeader() });
      const json = await res.json().catch(() => ({}));
      if (alive) setAvailable(Boolean(json.available));
    })();
    return () => {
      alive = false;
    };
  }, [tenancyId]);
  if (!available) return null;
  async function open() {
    setErr("");
    const res = await fetch(`/api/tenancy/payprop-letter?tenancy=${tenancyId}`, { headers: await authHeader() });
    const json = await res.json().catch(() => ({}));
    if (json.url) window.open(json.url, "_blank", "noopener");
    else setErr(json.error || "We couldn't open it. Try again.");
  }
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn ghost sm" onClick={open}>
        Your PayProp welcome letter{label ? ` (${label})` : ""}
      </button>
      {err ? <span className="err">{err}</span> : null}
    </div>
  );
}

export function PayRentCard({ homes = [] }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h3>Paying Rent</h3>
      <p className="small" style={{ margin: 0 }}>
        <b>{PAYMENT_INFO.preferred} (preferred).</b> {PAYMENT_INFO.preferredSteps.join(" ")}
      </p>
      <p className="small" style={{ margin: 0 }}>
        <b>Monthly $100 draw.</b> {PAYMENT_INFO.draw}
      </p>
      {homes.map((h) => (
        <PaypropLetterLink key={h.tenancy_id} tenancyId={h.tenancy_id} label={homes.length > 1 ? h.address : ""} />
      ))}
      <p className="small" style={{ margin: 0 }}>
        <b>Can&apos;t use PayProp?</b> {PAYMENT_INFO.fallbackNote}
      </p>
    </div>
  );
}

const INS_LABEL = { submitted: "Sent, waiting for review", approved: "Approved", rejected: "Not accepted" };

export function InsuranceCard({ home }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [insurer, setInsurer] = useState("");
  const [policy, setPolicy] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const load = useCallback(async () => {
    const { data } = await getBrowserClient()
      .from("tenant_insurance")
      .select("id, status, file_name, insurer, expires_on, review_note, created_at")
      .eq("tenancy_id", home.tenancy_id)
      .order("created_at", { ascending: false });
    setList(data || []);
  }, [home.tenancy_id]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(e) {
    e.preventDefault();
    if (!file) return setMsg({ kind: "err", text: "Choose the file first." });
    if (file.size > 10 * 1024 * 1024) return setMsg({ kind: "err", text: "That file is over 10 MB. Try a PDF or a smaller photo." });
    setBusy(true);
    setMsg({ kind: "", text: "" });
    const sb = getBrowserClient();
    const { data: u } = await sb.auth.getUser();
    const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${home.tenancy_id}/${Date.now()}-${safe}`;
    const up = await sb.storage.from("tenant-insurance").upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setBusy(false);
      return setMsg({ kind: "err", text: "The upload didn't work. Try again, or use a PDF or JPG." });
    }
    const { data: row, error } = await sb
      .from("tenant_insurance")
      .insert({
        tenancy_id: home.tenancy_id,
        uploaded_by: u?.user?.id,
        file_path: path,
        file_name: file.name,
        insurer: insurer.trim() || null,
        policy_number: policy.trim() || null,
        expires_on: expires || null,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return setMsg({ kind: "err", text: "We couldn't save it. Try again." });
    }
    await fetch("/api/insurance/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ id: row.id, event: "uploaded" }),
    }).catch(() => {});
    setBusy(false);
    setOpen(false);
    setFile(null);
    setMsg({ kind: "ok", text: "Thanks! We've received your proof of insurance." });
    load();
  }

  if (list === null) return null;
  const latest = list[0];
  const due = home.insurance_due;
  const overdue = due && !latest && todayIso() > due;

  return (
    <div className={`stack${overdue ? " attention" : ""}`} style={{ gap: 8 }} id="insurance">
      <h3>Tenant Insurance</h3>
      {latest ? (
        <p className="small" style={{ margin: 0 }}>
          {INS_LABEL[latest.status]}: {latest.file_name}
          {latest.expires_on ? ` (expires ${longDay(latest.expires_on)})` : ""}.
          {latest.status === "rejected" && latest.review_note ? ` What's missing: ${latest.review_note}` : ""}
        </p>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          Your lease requires tenant insurance. Please upload proof
          {due ? ` by ${longDay(due)}` : " within a week of moving in"}: the page showing your name, this address and the policy dates.
        </p>
      )}
      {msg.text ? <div className={msg.kind === "err" ? "warnbox" : "okbox"}>{msg.text}</div> : null}
      {open ? (
        <form className="stack" style={{ gap: 10 }} onSubmit={upload}>
          <div className="field">
            <label htmlFor={`ins-file-${home.tenancy_id}`}>Proof of insurance (PDF or photo)</label>
            <input id={`ins-file-${home.tenancy_id}`} type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="row3">
            <div className="field">
              <label htmlFor={`ins-co-${home.tenancy_id}`}>Insurance company (optional)</label>
              <input id={`ins-co-${home.tenancy_id}`} value={insurer} onChange={(e) => setInsurer(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`ins-pol-${home.tenancy_id}`}>Policy number (optional)</label>
              <input id={`ins-pol-${home.tenancy_id}`} value={policy} onChange={(e) => setPolicy(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`ins-exp-${home.tenancy_id}`}>Expiry date (optional)</label>
              <input id={`ins-exp-${home.tenancy_id}`} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <button className="btn primary sm" type="submit" disabled={busy}>
              {busy ? "Uploading…" : "Upload"}
            </button>
            <button className="btn ghost sm" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : !latest || latest.status === "rejected" || latest.status === "approved" ? (
        <div>
          <button className="btn ghost sm" type="button" onClick={() => setOpen(true)}>
            {latest ? "Upload a new copy" : "Upload proof of insurance"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const CHOICES = [
  ["month_to_month", "Stay month to month", "Your lease terms carry on; nothing to sign."],
  ["new_lease", "Ask for a new lease", "We'll check with the landlord and send you a new lease."],
  ["moving_out", "I'm moving out", "You'll give your 60-day notice (N9) below."],
];

export function LeaseEndCard({ home, onChoice }) {
  const [choice, setChoice] = useState(home.renewal_choice || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!home.end_date || home.status !== "active") return null;
  const left = daysUntil(home.end_date);
  if (left < 0 || left > 120) return null;
  const deadline = new Date(new Date(`${home.end_date}T12:00:00`).getTime() - 60 * 86400000).toISOString().slice(0, 10);

  async function pick(c) {
    setBusy(c);
    setError("");
    const res = await fetch("/api/tenant/renewal-choice", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ tenancy_id: home.tenancy_id, choice: c }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(json.error || "That didn't save. Try again.");
    setChoice(c);
    onChoice?.(c);
  }

  return (
    <div className={`stack${choice ? "" : " attention"}`} style={{ gap: 8 }} id="lease-end">
      <h3>Your lease ends {longDay(home.end_date)}</h3>
      {choice ? (
        <p className="small" style={{ margin: 0 }}>
          You told us: <b>{CHOICES.find((c) => c[0] === choice)?.[1]}</b>. {CHOICES.find((c) => c[0] === choice)?.[2]} You can change
          your answer below.
        </p>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          What would you like to do? If you&apos;re moving out then, your notice must be given by {longDay(deadline)}. If you do nothing,
          your tenancy simply continues month to month.
        </p>
      )}
      <div className="row" style={{ flexWrap: "wrap" }}>
        {CHOICES.map(([k, label]) => (
          <button key={k} type="button" className={`btn ${choice === k ? "primary" : "ghost"} sm`} disabled={Boolean(busy)} onClick={() => pick(k)}>
            {busy === k ? "Saving…" : label}
          </button>
        ))}
      </div>
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}

const TENANT_STEPS = [
  ["Check your home details", "Your address and lease dates are above."],
  ["Set up rent payments", "Watch for the PayProp invitation, or ask us about e-Transfer."],
  ["Upload tenant insurance", "Due within a week of moving in."],
  ["Report problems here", "Use Report a problem, with photos. Emergencies: call us."],
  ["Read your rights", "Our resources page has the Landlord and Tenant Board guides."],
  ["Add the app to your phone", "Open Get the App at the bottom of any page to put IRep on your home screen."],
];

export function GettingStarted({ role = "tenant", dismissedAt, onDismiss }) {
  const [hidden, setHidden] = useState(Boolean(dismissedAt));
  if (hidden) return null;
  const steps =
    role === "owner"
      ? [
          ["See your properties", "Units, who lives there, and your agreement (first year, then month to month)."],
          ["Monthly statements", "Rent collected, fees, repairs and what we sent you, month by month."],
          ["Approve applicants", "We never accept a tenant without your OK."],
          ["Approve repairs", "Repairs over $250 that aren't emergencies wait for your OK. Emergencies are handled right away."],
          ["Sign notices", "If rent is late, we email you the N4 to sign around the 8th, then deliver it to the tenant."],
          ["Year-end summary", "Your rental income and expenses, laid out for your T776."],
          ["Refer a landlord", "When a landlord you refer signs with us, you get a month's management fee free."],
          ["Add the app to your phone", "Open Get the App at the bottom of any page to put IRep on your home screen."],
        ]
      : TENANT_STEPS;

  async function dismiss() {
    setHidden(true);
    const sb = getBrowserClient();
    const { data } = await sb.auth.getUser();
    if (data?.user) await sb.from("profiles").update({ tour_dismissed_at: new Date().toISOString() }).eq("id", data.user.id);
    onDismiss?.();
  }

  return (
    <section className="boxed stack" aria-labelledby="gs-title" style={{ gap: 10 }}>
      <div className="admin-head">
        <h2 id="gs-title" className="sec-title">
          Welcome! Here&apos;s How This Works
        </h2>
        <button type="button" className="btn ghost sm" onClick={dismiss}>
          Got It, Hide This
        </button>
      </div>
      <ol className="stack" style={{ gap: 6, margin: 0, paddingLeft: 20 }}>
        {steps.map(([t, d]) => (
          <li key={t}>
            <b>{t}.</b> <span className="small">{d}</span>
          </li>
        ))}
      </ol>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/resources">Open the resources page</Link>
      </p>
    </section>
  );
}
