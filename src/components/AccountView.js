"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import MyHome from "./MyHome";
import { getBrowserClient } from "@/lib/supabase";
import { ACCEPT, CONSENT_TEXT, DOC_BUCKET, DOC_TYPES, INCOME_TYPES, MAX_FILE_MB, consentCurrent } from "@/lib/documents";
import { listingTitle, money } from "@/lib/format";
import AddressInput from "@/components/AddressInput";
import ReferencesEditor from "@/components/ReferencesEditor";
import MyApplicationExtras from "@/components/MyApplicationExtras";

const STATUS_LABEL = {
  requested: "Requested",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  submitted: "Submitted",
  reviewing: "Under review",
  approved: "Approved",
  declined: "Not approved",
  withdrawn: "Withdrawn",
};

const OPEN_STATUSES = ["submitted", "reviewing", "approved"];
const WITHDRAWABLE = ["submitted", "reviewing"];
const CLOSED_STATUSES = ["withdrawn", "declined"];
const ALREADY_TEXT = "You already have an application in for this listing.";

export default function AccountView() {
  const { user, ready, configured, openSignIn, signOut } = useAuth();
  const [tab, setTab] = useState("docs");
  const [profile, setProfile] = useState(null);
  const [docs, setDocs] = useState([]);
  const [showings, setShowings] = useState([]);
  const [apps, setApps] = useState([]);
  const [messages, setMessages] = useState({});
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busyDoc, setBusyDoc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [already, setAlready] = useState(false);
  const [withdrawing, setWithdrawing] = useState("");

  const load = useCallback(async () => {
    const sb = getBrowserClient();
    if (!sb || !user) return;
    const applyId = new URLSearchParams(window.location.search).get("apply");
    const [p, d, s, a, l] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("applicant_documents").select("*").eq("user_id", user.id),
      sb
        .from("showing_requests")
        .select("id, preferred_date, preferred_time, status, created_at, listings(address, unit, slug)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      sb
        .from("applications")
        .select("id, listing_id, status, created_at, documents, consent_text, listings(id, address, unit, slug, status)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      applyId
        ? sb.from("listings").select("id, address, unit, slug, rent").eq("id", applyId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setProfile(p.data || { id: user.id, email: user.email });
    setDocs(d.data || []);
    setShowings(s.data || []);
    setApps(a.data || []);
    const ids = (a.data || []).map((x) => x.id);
    const m = ids.length
      ? await sb.from("application_messages").select("*").in("application_id", ids).order("created_at")
      : { data: [] };
    const byApp = {};
    for (const row of m.data || []) (byApp[row.application_id] ||= []).push(row);
    setMessages(byApp);
    setPending(null);
    if (l.data) {
      const open = (a.data || []).find((x) => x.listing_id === l.data.id && OPEN_STATUSES.includes(x.status));
      if (open) {
        setAlready(true);
        window.history.replaceState(null, "", "/account");
      } else {
        setAlready(false);
        setPending(l.data);
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (ready && user) load();
    else if (ready) setLoading(false);
  }, [ready, user, load]);

  if (!configured) {
    return (
      <div className="empty">
        <h2>Online accounts are coming soon</h2>
        <p>Renter profiles, showings and applications will appear here once accounts are switched on.</p>
      </div>
    );
  }
  if (!ready || (user && loading)) {
    return <p className="small">Loading your profile…</p>;
  }
  if (!user) {
    return (
      <div className="empty">
        <h2>Sign in to see your profile</h2>
        <p>Your documents, showings and applications live here.</p>
        <button className="btn primary" onClick={() => openSignIn("/account")}>
          Create account or sign in
        </button>
      </div>
    );
  }

  const sb = getBrowserClient();
  const incomeType = profile?.income_type || null;
  const docOf = (key) => {
    if (key === "income") return docs.find((d) => d.doc_type === "income" && d.income_type === incomeType) || null;
    return docs.find((d) => d.doc_type === key) || null;
  };
  const missing = [];
  if (!profile?.full_name) missing.push("your full legal name");
  if (!profile?.phone) missing.push("your phone number");
  if (!profile?.current_address) missing.push("your current address");
  if (!docOf("photo_id")) missing.push("photo ID");
  if (!incomeType || !docOf("income")) missing.push("proof of income");
  if (!consentCurrent(profile?.credit_consent_at)) missing.push("credit check and sharing authorization");
  const readyToApply = missing.length === 0;
  const hasReferences = Array.isArray(profile?.rental_references) && profile.rental_references.some((r) => r?.name);
  const consentOutdated = Boolean(profile?.credit_consent_at) && !consentCurrent(profile?.credit_consent_at);

  async function saveProfile(fields) {
    setError("");
    const { data, error: err } = await sb.from("profiles").update(fields).eq("id", user.id).select("*").single();
    if (err) return setError("We couldn't save that change. Try again.");
    setProfile(data);
  }

  async function fileIsAttached(path) {
    const { data } = await sb.from("applications").select("id").eq("user_id", user.id).contains("documents", JSON.stringify([{ path }])).limit(1);
    return Boolean(data && data.length);
  }

  async function upload(docType, file) {
    setError("");
    setMsg("");
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) return setError(`That file is over ${MAX_FILE_MB} MB. Try a smaller scan or photo.`);
    setBusyDoc(docType);
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${user.id}/${docType}/${Date.now()}-${safe}`;
    const up = await sb.storage.from(DOC_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) {
      setBusyDoc("");
      return setError("That upload didn't go through. Use a PDF, JPG or PNG under 10 MB and try again.");
    }
    const previous = docs.find((d) => d.doc_type === docType);
    const { data, error: err } = await sb
      .from("applicant_documents")
      .upsert(
        {
          user_id: user.id,
          doc_type: docType,
          income_type: docType === "income" ? incomeType : null,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: "user_id,doc_type" }
      )
      .select("*")
      .single();
    if (err) {
      await sb.storage.from(DOC_BUCKET).remove([path]);
      setBusyDoc("");
      return setError("We couldn't save that document. Try again.");
    }
    if (previous && !(await fileIsAttached(previous.file_path))) {
      await sb.storage.from(DOC_BUCKET).remove([previous.file_path]);
    }
    setDocs((list) => [...list.filter((d) => d.doc_type !== docType), data]);
    setBusyDoc("");
  }

  async function remove(doc) {
    setError("");
    setBusyDoc(doc.doc_type);
    const { error: err } = await sb.from("applicant_documents").delete().eq("id", doc.id);
    if (err) {
      setBusyDoc("");
      return setError("We couldn't remove that document. Try again.");
    }
    if (!(await fileIsAttached(doc.file_path))) await sb.storage.from(DOC_BUCKET).remove([doc.file_path]);
    setDocs((list) => list.filter((d) => d.id !== doc.id));
    setBusyDoc("");
  }

  async function submitApplication() {
    if (!pending || !readyToApply) return;
    setSubmitting(true);
    setError("");
    const attached = docs
      .filter((d) => d.doc_type !== "income" || d.income_type === incomeType)
      .map((d) => ({ type: d.doc_type, name: d.file_name, path: d.file_path }));
    const { error: err } = await sb.from("applications").insert({
      user_id: user.id,
      listing_id: pending.id,
      applicant_name: profile.full_name,
      applicant_email: profile.email || user.email,
      applicant_phone: profile.phone,
      applicant_address: profile.current_address || null,
      applicant_dob: profile.date_of_birth || null,
      rental_references: Array.isArray(profile.rental_references) ? profile.rental_references : [],
      income_type: incomeType,
      documents: attached,
      credit_consent: true,
      consent_text: CONSENT_TEXT,
      consent_at: profile.credit_consent_at,
    });
    setSubmitting(false);
    if (err) {
      if (err.code === "23505") {
        setPending(null);
        setAlready(true);
        window.history.replaceState(null, "", "/account");
        return;
      }
      return setError("We couldn't submit your application. Try again.");
    }
    setMsg(`Application sent for ${listingTitle(pending)}. We'll be in touch within 2 business days.`);
    setPending(null);
    window.history.replaceState(null, "", "/account");
    await load();
    setTab("apps");
  }

  async function withdraw(app) {
    const title = app.listings ? listingTitle(app.listings) : "this listing";
    if (!window.confirm(`Withdraw your application for ${title}? You can apply again later.`)) return;
    setWithdrawing(app.id);
    setError("");
    setMsg("");
    const { error: err } = await sb.rpc("withdraw_application", { p_application_id: app.id });
    setWithdrawing("");
    if (err) return setError("We couldn't withdraw that application. Try again.");
    setMsg(`Application for ${title} withdrawn.`);
    await load();
  }

  function applyAgain(listingId) {
    setMsg("");
    setError("");
    setAlready(false);
    window.history.replaceState(null, "", `/account?apply=${encodeURIComponent(listingId)}`);
    setTab("docs");
    load();
  }

  // Newest application per listing decides whether "Apply again" shows.
  const latestByListing = {};
  for (const a of apps) if (a.listing_id && !latestByListing[a.listing_id]) latestByListing[a.listing_id] = a;
  const canApplyAgain = (a) =>
    CLOSED_STATUSES.includes(a.status) &&
    latestByListing[a.listing_id]?.id === a.id &&
    a.listings?.status === "available";

  const docRow = (key, name, desc, required) => {
    const d = docOf(key);
    const busy = busyDoc === key;
    return (
      <div className="doc" key={key}>
        <span className="dname">
          {name}{" "}
          {d ? <span className="pill done">Uploaded</span> : required ? <span className="pill req">Required</span> : <span className="pill opt">Optional</span>}
        </span>
        {desc ? <span className="ddesc">{desc}</span> : null}
        {d ? <span className="file">{d.file_name}</span> : null}
        <span className="ctl">
          <label className="btn ghost sm" htmlFor={`up-${key}`} aria-disabled={busy}>
            {busy ? "Uploading…" : d ? "Replace" : "Upload"}
          </label>
          <input
            className="visually-hidden"
            type="file"
            id={`up-${key}`}
            accept={ACCEPT}
            disabled={busy}
            onChange={(e) => {
              upload(key, e.target.files && e.target.files[0]);
              e.target.value = "";
            }}
          />
          {d ? (
            <button className="btn ghost sm" onClick={() => remove(d)} disabled={busy}>
              Remove
            </button>
          ) : null}
        </span>
      </div>
    );
  };

  const inc = incomeType ? INCOME_TYPES[incomeType] : null;

  return (
    <div className="acctgrid">
      <div className="stack">
        <div>
          <span className="eyebrow">Signed in</span>
          <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{user.email}</div>
          {profile?.phone ? <div className="small">{profile.phone}</div> : null}
        </div>
        <nav className="acctnav" aria-label="Account">
          {[
            ["docs", "My documents"],
            ["showings", `My showings${showings.length ? ` (${showings.length})` : ""}`],
            ["apps", `My applications${apps.length ? ` (${apps.length})` : ""}`],
          ].map(([k, v]) => (
            <button key={k} aria-current={tab === k} onClick={() => setTab(k)}>
              {v}
            </button>
          ))}
        </nav>
        <button className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </div>

      <div className="acctpanel">
        {msg ? <div className="okbox">{msg}</div> : null}
        {error ? <div className="warnbox">{error}</div> : null}
        {already ? (
          <div className="okbox">
            {ALREADY_TEXT}{" "}
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setAlready(false);
                setTab("apps");
              }}
            >
              View my applications
            </button>
          </div>
        ) : null}

        {tab === "docs" ? (
          <>
            <MyHome user={user} />

            {pending ? (
              <div className="boxed stack" style={{ gap: 10 }}>
                <span className="eyebrow">Applying for</span>
                <h3>{listingTitle(pending)}</h3>
                <p className="small num">{money(pending.rent)} / month</p>
                {readyToApply ? (
                  <p>Everything's ready. Your documents below will be attached.</p>
                ) : (
                  <p>Before you can submit, add {missing.join(", ")}.</p>
                )}
                {!hasReferences ? <p className="small">Tip: adding references helps your application.</p> : null}
                <div>
                  <button className="btn primary" disabled={!readyToApply || submitting} onClick={submitApplication}>
                    {submitting ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 8 }}>
              <h2>My documents</h2>
              <p className="lead" style={{ fontSize: "1rem" }}>
                Upload these once. They're attached to every application you submit, and only IRep staff can see them.
              </p>
            </div>

            <ProfileFields profile={profile} onSave={saveProfile} />

            <ReferencesEditor key={profile?.id} references={profile?.rental_references} onSave={saveProfile} />

            <div style={{ display: "grid", gap: 10 }}>
              <span className="eyebrow">Your situation</span>
              <div className="seg" role="group" aria-label="Income type">
                {Object.entries(INCOME_TYPES).map(([k, v]) => (
                  <button key={k} type="button" aria-pressed={incomeType === k} onClick={() => saveProfile({ income_type: k })}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="docs">
              {docRow("photo_id", "Photo ID", DOC_TYPES[0].desc, true)}
              {inc ? (
                docRow("income", inc.doc, inc.desc, true)
              ) : (
                <div className="doc">
                  <span className="dname">
                    Proof of income <span className="pill req">Required</span>
                  </span>
                  <span className="ddesc">
                    Choose your situation above: an acceptance letter if you're a student, a job letter if you're employed, or
                    a statement of support.
                  </span>
                </div>
              )}
              {DOC_TYPES.filter((d) => !d.required).map((d) => docRow(d.key, d.name, d.desc, false))}
            </div>

            <div className="consent">
              <span className="dname" style={{ fontWeight: 600, display: "flex", gap: 10, alignItems: "center" }}>
                Credit check authorization{" "}
                {consentCurrent(profile?.credit_consent_at) ? <span className="pill done">Given</span> : <span className="pill req">Required</span>}
              </span>
              {consentOutdated ? (
                <p className="warnbox small">
                  We&apos;ve updated this authorization to include sharing your application with the property&apos;s owner. Please
                  review and tick it again.
                </p>
              ) : null}
              <label htmlFor="consent">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consentCurrent(profile?.credit_consent_at)}
                  onChange={(e) => saveProfile({ credit_consent_at: e.target.checked ? new Date().toISOString() : null })}
                />
                <span>{CONSENT_TEXT}</span>
              </label>
              <span className="small">
                The check runs only after you submit an application. Only IRep staff and the owner of the property you apply for
                see your application, documents, references and credit report.
              </span>
            </div>
          </>
        ) : null}

        {tab === "showings" ? (
          <>
            <h2>My showings</h2>
            {showings.length ? (
              <div className="list">
                {showings.map((s) => (
                  <div className="it" key={s.id}>
                    <div>
                      {s.listings ? <Link href={`/properties/${s.listings.slug}`}><b>{listingTitle(s.listings)}</b></Link> : <b>Listing no longer available</b>}
                      <div className="small">
                        {new Date(s.preferred_date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })},{" "}
                        {s.preferred_time.toLowerCase()}
                      </div>
                    </div>
                    <span className="pill sub">{STATUS_LABEL[s.status] || s.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                No showings yet. <Link href="/properties">Browse rentals</Link> and pick a time.
              </div>
            )}
          </>
        ) : null}

        {tab === "apps" ? (
          <>
            <h2>My applications</h2>
            {apps.length ? (
              <div className="list">
                {apps.map((a) => (
                  <div className="it" key={a.id}>
                    <div>
                      {a.listings ? <Link href={`/properties/${a.listings.slug}`}><b>{listingTitle(a.listings)}</b></Link> : <b>Listing no longer available</b>}
                      <div className="small">
                        Sent {new Date(a.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
                        {(a.documents || []).length} documents attached
                      </div>
                    </div>
                    <div className="app-ctl">
                      <span className="pill sub">{STATUS_LABEL[a.status] || a.status}</span>
                      {WITHDRAWABLE.includes(a.status) ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => withdraw(a)}
                          disabled={withdrawing === a.id}
                        >
                          {withdrawing === a.id ? "Withdrawing…" : "Withdraw"}
                        </button>
                      ) : canApplyAgain(a) ? (
                        <button type="button" className="btn ghost sm" onClick={() => applyAgain(a.listing_id)}>
                          Apply again
                        </button>
                      ) : null}
                    </div>
                    <MyApplicationExtras app={a} messages={messages[a.id] || []} onReload={load} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No applications yet.</div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProfileFields({ profile, onSave }) {
  const [name, setName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.current_address || "");
  const [dob, setDob] = useState(profile?.date_of_birth || "");
  const [saved, setSaved] = useState(false);
  const dirty =
    name !== (profile?.full_name || "") ||
    phone !== (profile?.phone || "") ||
    address !== (profile?.current_address || "") ||
    dob !== (profile?.date_of_birth || "");

  async function save(e) {
    e.preventDefault();
    await onSave({
      full_name: name.trim() || null,
      phone: phone.trim() || null,
      current_address: address.trim() || null,
      date_of_birth: dob || null,
    });
    setSaved(true);
  }

  return (
    <form className="boxed stack" style={{ gap: 12 }} onSubmit={save}>
      <div className="row2">
        <div className="field">
          <label htmlFor="p-name">Full legal name</label>
          <input id="p-name" value={name} autoComplete="name" onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </div>
        <div className="field">
          <label htmlFor="p-phone">Mobile number</label>
          <input id="p-phone" type="tel" value={phone} autoComplete="tel" onChange={(e) => { setPhone(e.target.value); setSaved(false); }} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="p-address">Current address</label>
        <AddressInput
          id="p-address"
          fill="formatted"
          value={address}
          onChange={(v) => {
            setAddress(v);
            setSaved(false);
          }}
          placeholder="Start typing your street address"
        />
      </div>
      <div className="field">
        <label htmlFor="p-dob">Date of birth (optional)</label>
        <input
          id="p-dob"
          type="date"
          value={dob}
          max={new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10)}
          onChange={(e) => {
            setDob(e.target.value);
            setSaved(false);
          }}
        />
        <span className="small">Speeds up your credit check. Only IRep staff see it; it isn't shared with landlords.</span>
      </div>
      <div className="row">
        <button className="btn ghost sm" type="submit" disabled={!dirty}>
          Save
        </button>
        {saved && !dirty ? <span className="small">Saved</span> : null}
      </div>
    </form>
  );
}
