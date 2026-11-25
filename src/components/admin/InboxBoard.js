"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { refreshStaffCounts } from "@/lib/admin-nav";
import { shortDate } from "@/lib/rent";

const CATS = { maintenance: "Maintenance", rent: "Rent", lease: "Lease & Signatures", notices: "Notices", landlord: "Landlord", general: "General" };

// Staff: emails to administration@, sorted into categories with a one-line summary.
export default function InboxBoard() {
  const [rows, setRows] = useState(null);
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState("new");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [who, setWho] = useState("all");
  const [failed, setFailed] = useState([]);
  useEffect(() => {
    // Emails the portal couldn't send in the last two weeks (portal_sent exists after migration 0096).
    getBrowserClient()
      .from("portal_sent")
      .select("id, sent_at, to_emails, subject, error")
      .eq("status", "failed")
      .gte("sent_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("sent_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => setFailed(error ? [] : data || []));
  }, []);
  async function load() {
    let q = getBrowserClient().from("inbound_emails").select("*").order("received_at", { ascending: false }).limit(200);
    // A search looks through everything, received and sent, whatever its status.
    const t = term.replace(/[,()*%\\]/g, " ").trim();
    if (t) q = q.or(["subject", "from_name", "from_email", "party_name", "party_email", "body"].map((c) => `${c}.ilike.*${t}*`).join(","));
    else if (tab === "sent") {
      q = q.eq("direction", "out");
      if (who === "portal") q = q.eq("via_portal", true);
      if (who === "gmail") q = q.eq("via_portal", false);
    } else q = q.eq("direction", "in").eq("status", tab);
    if (cat) q = q.eq("category", cat);
    const { data } = await q;
    setRows(data || []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, tab, term, who]);
  async function mark(id, status) {
    await getBrowserClient().from("inbound_emails").update({ status }).eq("id", id);
    refreshStaffCounts();
    load();
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Assistant</span>
        <h1 className="admin-title">Inbox</h1>
        <p className="small">Emails to administration@, sorted automatically. Reply in Gmail; mark them handled here. Open an email to read the whole conversation or assign it to someone. The Sent tab shows everything sent, from Gmail and from the portal.</p>
      </div>
      <form
        className="req-actions"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search);
        }}
      >
        <input type="search" aria-label="Search emails" placeholder="Search name, email, subject or text" value={search} onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setTerm(""); }} style={{ minWidth: 260 }} />
        <button type="submit" className="btn ghost sm">
          Search
        </button>
        {term ? <span className="small">Showing all emails (received and sent) matching “{term}”.</span> : null}
      </form>
      <div className="req-actions" style={term ? { opacity: 0.5 } : undefined}>
        <div className="seg">
          {["new", "handled", "ignored", "sent"].map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        {tab === "sent" ? (
          <div className="seg">
            {[
              ["all", "All Sent"],
              ["portal", "From the Portal"],
              ["gmail", "From Gmail"],
            ].map(([k, v]) => (
              <button key={k} type="button" aria-pressed={who === k} onClick={() => setWho(k)}>
                {v}
              </button>
            ))}
          </div>
        ) : null}
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(CATS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {failed.length ? (
        <div className="warnbox" role="status">
          <b>
            {failed.length === 1 ? "1 email" : `${failed.length} emails`} from the portal didn’t send in the last two weeks
          </b>
          <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {failed.map((f) => (
              <li key={f.id}>
                {shortDate(String(f.sent_at).slice(0, 10))}: “{f.subject || "(no subject)"}” to {(f.to_emails || []).join(", ") || "(no one)"}
                {f.error ? ` · ${f.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tab === "sent" && !term ? (
        <p className="small">Everything sent from administration@, newest first. “Portal” marks emails the website sent for you; the rest were sent from Gmail.</p>
      ) : null}
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : !rows.length ? (
        <p className="small">{term ? "No emails match that search." : "Nothing here."}</p>
      ) : (
        <ul className="req-list">
          {rows.map((r) => (
            <li key={r.id} className="req">
              <div className="req-top">
                <Link href={`/admin/inbox/${r.id}`}>
                  <b>{r.subject || "(no subject)"}</b>
                </Link>
                <span className="small">
                  {r.via_portal ? <span className="pill">Portal</span> : null} {CATS[r.category] || "Not sorted"} · {shortDate(String(r.received_at).slice(0, 10))}
                </span>
              </div>
              <span className="small">
                {r.direction === "out" ? `Sent to ${(r.to_emails || []).join(", ")}` : `From ${r.from_name || r.from_email}`}
                {r.party_kind && r.party_kind !== "unmatched" ? ` · ${r.party_kind === "landlord" ? "Landlord" : r.party_kind === "tenant" ? "Tenant" : r.party_kind === "partner" ? "Partner" : r.party_kind === "applicant" ? "Applicant" : "Ignored"}${r.party_name ? `: ${r.party_name}` : ""}` : " · Unmatched"}
                {r.thread_id ? (
                  <>
                    {" · "}
                    <a href={`https://mail.google.com/mail/?authuser=administration%40ireppm.ca#all/${r.thread_id}`} target="_blank" rel="noreferrer">
                      Open in Gmail
                    </a>
                  </>
                ) : null}
              </span>
              {r.summary ? <p className="small" style={{ margin: "4px 0" }}>{r.summary}</p> : null}
              {tab === "new" && !term ? (
                <div className="req-actions">
                  <button type="button" className="btn ghost sm" onClick={() => mark(r.id, "handled")}>
                    Handled
                  </button>
                  <button type="button" className="link-btn small" onClick={() => mark(r.id, "ignored")}>
                    Ignore
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
