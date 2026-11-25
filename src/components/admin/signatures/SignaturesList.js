"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import SigStatus from "@/components/admin/signatures/SigStatus";
import DeleteRecord from "@/components/admin/DeleteRecord";
import { canDeleteSignature, deleteSignatureRequest } from "@/lib/delete-records";
import { SIG_FILTERS, SIG_KIND, kindLabel, SIG_LIST_SELECT, autoReminder, docusignApi, openInTab, outTo, shortDate } from "@/lib/signatures";

const LANDLORD_KINDS = ["pm_contract"];

export default function SignaturesList() {
  const [filter, setFilter] = useState("awaiting");
  const [kind, setKind] = useState("");
  // Who the documents are for: tenants (leases, notices, consents) or landlords (management contracts).
  const [side, setSide] = useState("");
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("for");
    if (f === "landlords" || f === "tenants") setSide(f);
  }, []);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState({});
  const [reminded, setReminded] = useState({});
  const [openError, setOpenError] = useState("");
  const [sort, setSort] = useState({ key: "created", dir: "desc" });
  // Rows ticked for a bulk reminder (out for signature only).
  const [picked, setPicked] = useState(() => new Set());
  const [bulk, setBulk] = useState("");
  // Signed leases and amendments whose onboarding isn't finished.
  const [onboarding, setOnboarding] = useState(() => new Set());
  useEffect(() => {
    getBrowserClient()
      .from("lease_onboarding")
      .select("signature_request_id")
      .eq("status", "open")
      .then(({ data }) => setOnboarding(new Set((data || []).map((d) => d.signature_request_id))));
  }, []);
  useEffect(() => {
    setPicked(new Set());
    setBulk("");
  }, [filter]);
  useEffect(() => {
    const ok = {
      status: ["awaiting", "closed"].includes(filter),
      reminded: filter === "awaiting",
      completed: filter === "completed",
    };
    setSort((cur) => (cur.key in ok && !ok[cur.key] ? { key: "created", dir: "desc" } : cur));
  }, [filter]);

  // Pull the latest from DocuSign (statuses, and envelopes made directly in DocuSign) when the page opens.
  const sync = async () => {
    setSyncing(true);
    setSyncNote("");
    try {
      const r = await docusignApi("/sync");
      if (r?.error) setSyncNote(`Couldn't check DocuSign: ${r.error}`);
      else if (r?.imported) setSyncNote(`Added ${r.imported} envelope${r.imported === 1 ? "" : "s"} from DocuSign.`);
      setVersion((v) => v + 1);
    } catch (err) {
      setSyncNote(`Couldn't check DocuSign: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };
  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resend = async (r) => {
    setBusy((b) => ({ ...b, [r.id]: "Resending…" }));
    try {
      const res = await docusignApi(`/requests/${r.id}`, { body: { action: "remind" } });
      setBusy((b) => ({ ...b, [r.id]: res?.error ? `Couldn't resend: ${res.error}` : "Resent" }));
      if (!res?.error) setReminded((m) => ({ ...m, [r.id]: res?.reminded_at || new Date().toISOString() }));
      return !res?.error;
    } catch (err) {
      setBusy((b) => ({ ...b, [r.id]: `Couldn't resend: ${err.message}` }));
      return false;
    }
  };

  // Sends reminders one after another (DocuSign rate-limits bursts) and reports how many went out.
  const remindPicked = async () => {
    const list = (rows || []).filter((r) => picked.has(r.id) && ["sent", "delivered"].includes(r.status));
    if (!list.length) return;
    if (!window.confirm(`Send a DocuSign reminder for ${list.length} ${list.length === 1 ? "document" : "documents"}? Everyone who hasn't signed yet gets the email again.`)) return;
    let ok = 0;
    for (const [i, r] of list.entries()) {
      setBulk(`Sending ${i + 1} of ${list.length}…`);
      if (await resend(r)) ok += 1;
    }
    setPicked(new Set());
    setBulk(
      ok === list.length
        ? `Reminders sent for ${ok} ${ok === 1 ? "document" : "documents"}.`
        : `Reminders sent for ${ok} of ${list.length}. The rows marked "Couldn't resend" didn't go.`
    );
  };
  const remindable = (r) => ["sent", "delivered"].includes(r.status) && Boolean(r.envelope_id);
  // The latest reminder: one sent from this site (or reported by DocuSign), or DocuSign's automatic one.
  const lastReminder = (r) => {
    const manual = reminded[r.id] || "";
    const auto = autoReminder(r);
    const autoAt = auto?.last || "";
    return autoAt > manual ? { at: autoAt, auto: true, next: auto.next } : { at: manual, auto: false, next: auto?.next || "" };
  };
  const togglePick = (id) =>
    setPicked((s0) => {
      const s1 = new Set(s0);
      if (s1.has(id)) s1.delete(id);
      else s1.add(id);
      return s1;
    });

  const openDocusign = async (r) => {
    setOpenError("");
    try {
      await openInTab(async () => (await docusignApi(`/requests/${r.id}`, { body: { action: "open" } })).url);
    } catch (err) {
      setOpenError(`Couldn't open “${r.title}” in DocuSign: ${err.message}`);
    }
  };

  useEffect(() => {
    let live = true;
    const statuses = SIG_FILTERS.find((f) => f.key === filter).statuses;
    let q = getBrowserClient()
      .from("signature_requests")
      .select(SIG_LIST_SELECT)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(200);
    if (kind) q = q.eq("kind", kind);
    else if (side === "landlords") q = q.in("kind", LANDLORD_KINDS);
    else if (side === "tenants") q = q.not("kind", "in", `(${LANDLORD_KINDS.join(",")})`);
    q.then(async ({ data, error: e }) => {
      if (!live) return;
      setRows(data || []);
      setError(e ? "We couldn't load signature requests. Refresh the page to try again." : "");
      // Latest reminder per request (sent from this site, or reported by DocuSign).
      const ids = (data || []).map((r) => r.id);
      if (!ids.length) return;
      const { data: ev } = await getBrowserClient()
        .from("signature_events")
        .select("signature_request_id, event, occurred_at")
        .in("signature_request_id", ids)
        .or("event.ilike.*remind*,event.ilike.*resent*")
        .order("occurred_at", { ascending: false });
      if (!live) return;
      const latest = {};
      for (const x of ev || []) if (!latest[x.signature_request_id]) latest[x.signature_request_id] = x.occurred_at;
      setReminded(latest);
    });
    return () => {
      live = false;
    };
  }, [filter, kind, side, version]);

  const STATUS_ORDER = { draft: 0, sent: 1, delivered: 2, completed: 3, declined: 4, voided: 5, error: 6 };
  // Sort choices that make sense for the tab: no "completed" dates while awaiting signature, no
  // reminders once signed, and status only where the tab holds more than one status.
  const sortOptions = [
    ["created:desc", "Newest first"],
    ["created:asc", "Oldest first"],
    ["title:asc", "Title A to Z"],
    ["title:desc", "Title Z to A"],
    ["kind:asc", "Kind A to Z"],
    ["kind:desc", "Kind Z to A"],
    ["out:asc", "Out to, A to Z"],
    ["out:desc", "Out to, Z to A"],
    ...(filter === "awaiting"
      ? [
          ["status:asc", "Status: drafts first"],
          ["status:desc", "Status: viewed first"],
        ]
      : filter === "closed"
        ? [
            ["status:asc", "Status: declined first"],
            ["status:desc", "Status: voided first"],
          ]
        : []),
    ["sent:desc", "Sent, newest first"],
    ["sent:asc", "Sent, oldest first"],
    ...(filter === "awaiting"
      ? [
          ["reminded:desc", "Reminder sent, newest first"],
          ["reminded:asc", "Reminder sent, oldest first"],
        ]
      : []),
    ...(filter === "completed"
      ? [
          ["completed:desc", "Signed, newest first"],
          ["completed:asc", "Signed, oldest first"],
        ]
      : []),
  ];
  const sortValue = (r, key) => {
    switch (key) {
      case "title":
        return String(r.title || "").toLowerCase();
      case "kind":
        return String(kindLabel(r) || "").toLowerCase();
      case "out":
        return String(outTo(r) || "").toLowerCase();
      case "status":
        return STATUS_ORDER[r.status] ?? 9;
      case "sent":
        return r.sent_at || "";
      case "reminded":
        return lastReminder(r).at;
      case "completed":
        return r.completed_at || "";
      default:
        return r.created_at || "";
    }
  };
  const sorted = (rows || []).slice().sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    // Blanks (not sent yet, no reminder) always go last.
    if (x === "" && y !== "") return 1;
    if (y === "" && x !== "") return -1;
    const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "en-CA", { numeric: true });
    return sort.dir === "asc" ? c : -c;
  });
  const sortBy = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: ["sent", "reminded", "completed", "created"].includes(key) ? "desc" : "asc" }));
  const Th = ({ k, children }) =>
    !sortOptions.some(([v]) => v.startsWith(`${k}:`)) ? (
      <th scope="col">{children}</th>
    ) : (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="th-sort" onClick={() => sortBy(k)}>
        {children}
        <span aria-hidden="true">{sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span>
      </button>
    </th>
    );

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Signatures</span>
            <h1 className="admin-title">Signatures</h1>
            <p className="small">Tenant leases and notices, and landlord management contracts, sent through DocuSign.</p>
          </div>
          <div className="req-actions">
            <button type="button" className="btn ghost sm" onClick={sync} disabled={syncing}>
              {syncing ? "Checking DocuSign…" : "Refresh from DocuSign"}
            </button>
            <Link className="btn primary sm" href="/admin/signatures/new?kind=upload">
              Upload a document
            </Link>
            <Link className="btn primary sm" href="/admin/signatures/new?kind=draft">
              Draft a document
            </Link>
            <Link className="btn primary sm" href="/admin/signatures/new?kind=N11">
              N11 (end a tenancy)
            </Link>
            <Link className="btn ghost sm" href="/admin/signatures/templates">
              Check Templates
            </Link>
          </div>
        </div>
      </div>

      <div className="sec-head">
        <div className="seg" role="group" aria-label="Filter by status">
          {SIG_FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Filter by who it's for">
          {[
            ["", "Everyone"],
            ["tenants", "Tenants"],
            ["landlords", "Landlords"],
          ].map(([k, label]) => (
            <button
              key={k || "all"}
              type="button"
              aria-pressed={side === k}
              onClick={() => {
                setSide(k);
                setKind("");
                const url = new URL(window.location.href);
                if (k) url.searchParams.set("for", k);
                else url.searchParams.delete("for");
                window.history.replaceState(null, "", url);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="sig-kind" className="visually-hidden">
            Kind
          </label>
          <select id="sig-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {Object.entries(SIG_KIND)
              .filter(([k]) => !side || (side === "landlords") === LANDLORD_KINDS.includes(k))
              .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label htmlFor="sig-sort" className="visually-hidden">
            Sort by
          </label>
          <select
            id="sig-sort"
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":");
              setSort({ key, dir });
            }}
          >
            {sortOptions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}
      {syncNote ? <p className="small" role="status">{syncNote}</p> : null}
      {openError ? <div className="warnbox" role="alert">{openError}</div> : null}
      {(rows || []).some(remindable) ? (
        <div className="req-actions" style={{ alignItems: "center" }}>
          <button type="button" className="btn primary sm" onClick={remindPicked} disabled={!picked.size || bulk.startsWith("Sending")}>
            {picked.size ? `Send ${picked.size} ${picked.size === 1 ? "Reminder" : "Reminders"}` : "Send Reminders"}
          </button>
          <button
            type="button"
            className="link-btn small"
            onClick={() => setPicked(new Set((sorted || []).filter(remindable).map((r) => r.id)))}
          >
            Select all out for signature
          </button>
          {picked.size ? (
            <button type="button" className="link-btn small" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          ) : null}
          {bulk ? <span className="small" role="status">{bulk}</span> : <span className="small">
              DocuSign reminds anyone who hasn&apos;t signed automatically: 2 days after sending, then every 2 days. To nudge sooner, tick
              documents and send reminders now.
            </span>}
        </div>
      ) : null}
      {rows === null ? (
        <p className="small">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p>Nothing here.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: 28 }}>
                  <span className="visually-hidden">Select for reminder</span>
                </th>
                <Th k="title">Title</Th>
                <Th k="kind">Kind</Th>
                <Th k="out">Out to</Th>
                <Th k="status">Status</Th>
                <Th k="sent">Sent</Th>
                <Th k="reminded">Reminder sent</Th>
                <Th k="completed">Completed</Th>
                <th scope="col" className="r">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>
                    {remindable(r) ? (
                      <input
                        type="checkbox"
                        checked={picked.has(r.id)}
                        onChange={() => togglePick(r.id)}
                        aria-label={`Select ${r.title} for a reminder`}
                      />
                    ) : null}
                  </td>
                  <td>
                    <Link className="addr" href={`/admin/signatures/${r.id}`}>
                      {r.title}
                    </Link>
                    {r.terms?.imported ? <span className="small muted"> · made in DocuSign</span> : null}
                    {onboarding.has(r.id) ? (
                      <Link href="/admin/onboarding" className="pill ts-upcoming" style={{ marginLeft: 6 }}>
                        Signed: onboarding open
                      </Link>
                    ) : null}
                  </td>
                  <td>{kindLabel(r)}</td>
                  <td className="small">{outTo(r) || "—"}</td>
                  <td>
                    <SigStatus status={r.status} />
                  </td>
                  <td className="small">{shortDate(r.sent_at) || "—"}</td>
                  <td className="small">
                    {(() => {
                      const lr = lastReminder(r);
                      return (
                        <>
                          {lr.at ? shortDate(lr.at) : "—"}
                          {lr.at && lr.auto ? <span className="muted"> (auto)</span> : null}
                          {lr.next ? <div className="muted">Next auto: {shortDate(lr.next)}</div> : null}
                        </>
                      );
                    })()}
                  </td>
                  <td className="small">{shortDate(r.completed_at) || "—"}</td>
                  <td className="r">
                    {r.envelope_id && ["draft", "sent", "delivered"].includes(r.status) ? (
                      <button type="button" className="btn ghost sm" onClick={() => openDocusign(r)}>
                        Open in DocuSign<span className="visually-hidden">: {r.title}</span>
                      </button>
                    ) : null}{" "}
                    {["sent", "delivered"].includes(r.status) ? (
                      busy[r.id] ? (
                        <span className="small">{busy[r.id]}</span>
                      ) : (
                        <button type="button" className="link-btn small" onClick={() => resend(r)}>
                          Resend
                        </button>
                      )
                    ) : null}
                    {canDeleteSignature(r) ? (
                      <DeleteRecord
                        summary={`"${r.title}"`}
                        run={(reason) => deleteSignatureRequest(r, reason)}
                        onDeleted={() => setRows((list) => list.filter((x) => x.id !== r.id))}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
