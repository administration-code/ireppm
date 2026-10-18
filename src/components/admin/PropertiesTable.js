"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { PACKAGE_LABEL, PROPERTY_SELECT, propertyTitle } from "@/lib/admin-properties";
import RenewalBadge from "./RenewalBadge";

const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");

async function staffApi(url, body) {
  const { data } = await getBrowserClient().auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${data?.session?.access_token || ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || "That didn't go through. Try again.");
  return json;
}

// Owner portal status, from the owners table and email opt-outs.
async function loadOwnerStatus() {
  const sb = getBrowserClient();
  const [{ data: owners }, { data: outs }] = await Promise.all([
    sb.from("owners").select("id, email, profile_id, portal_invited_at"),
    sb.from("email_optouts").select("email"),
  ]);
  const out = new Set((outs || []).map((o) => o.email));
  return new Map(
    (owners || []).map((o) => [o.id, { ...o, unsubscribed: Boolean(o.email && out.has(o.email.trim().toLowerCase())) }])
  );
}

const ownerInvitable = (o, property) => Boolean(o && o.email && !o.profile_id && !o.unsubscribed && !property.archived);

function OwnerPortal({ o }) {
  if (!o) return null;
  if (o.profile_id) return <span className="pill ts-active">Joined</span>;
  if (o.unsubscribed) return <span className="small">Unsubscribed</span>;
  if (!o.email) return <span className="small">No email</span>;
  if (o.portal_invited_at) return <span className="small">Invited {shortDay(o.portal_invited_at)}</span>;
  return <span className="small">Not invited</span>;
}

// Offline units are neither occupied nor available, so they're counted on their own.
function unitCounts(units = []) {
  const c = { occupied: 0, vacant: 0, turnover: 0, offline: 0 };
  for (const u of units) if (u.status in c) c[u.status] += 1;
  return c;
}

function matches(p, q) {
  if (!q) return true;
  return [p.address, p.city, p.postal_code, p.owner?.name, p.owner?.email, p.owner?.phone]
    .filter(Boolean)
    .some((v) => v.toLowerCase().includes(q));
}

const SORTS = {
  address: (a, b) => a.address.localeCompare(b.address, "en-CA", { numeric: true }),
  renewal: (a, b) => {
    if (!a.agreement_renewal && !b.agreement_renewal) return SORTS.address(a, b);
    if (!a.agreement_renewal) return 1;
    if (!b.agreement_renewal) return -1;
    return a.agreement_renewal.localeCompare(b.agreement_renewal) || SORTS.address(a, b);
  },
};

export default function PropertiesTable() {
  const [state, setState] = useState({ loading: true, properties: [], error: "" });
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState("address");
  const [owners, setOwners] = useState(() => new Map());
  const [picked, setPicked] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState({ kind: "", text: "" });

  useEffect(() => {
    loadOwnerStatus().then(setOwners, () => {});
  }, []);

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("properties")
      .select(`${PROPERTY_SELECT}, units(status)`)
      .order("address")
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          properties: data || [],
          error: error ? "We couldn't load the properties. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const { loading, properties, error } = state;
  const q = query.trim().toLowerCase();
  const archivedCount = properties.filter((p) => p.archived).length;
  const shown = properties.filter((p) => (showArchived || !p.archived) && matches(p, q)).sort(SORTS[sort]);

  // Invitations go to owners, so several properties with the same owner count once.
  const ownerOf = (p) => (p.owner ? owners.get(p.owner.id) : null);
  const pickableOwners = [...new Set(shown.filter((p) => ownerInvitable(ownerOf(p), p)).map((p) => p.owner.id))];
  const pickedHere = pickableOwners.filter((id) => picked.has(id));
  const allOn = pickableOwners.length > 0 && pickedHere.length === pickableOwners.length;
  const resends = pickedHere.filter((id) => owners.get(id)?.portal_invited_at).length;
  const togglePick = (id) =>
    setPicked((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setPicked((set) => {
      const next = new Set(set);
      pickableOwners.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });

  async function sendInvites() {
    setSending(true);
    setNotice({ kind: "", text: "" });
    try {
      const r = await staffApi("/api/admin/invites", { owners: pickedHere });
      setNotice({
        kind: r.sent ? "ok" : "err",
        text: `Sent ${r.sent} owner invitation${r.sent === 1 ? "" : "s"}.${r.skipped?.length ? ` Not sent: ${r.skipped.join(", ")}.` : ""}`,
      });
      setPicked(new Set());
      setOwners(await loadOwnerStatus());
    } catch (err) {
      setNotice({ kind: "err", text: err.message });
    }
    setSending(false);
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="admin-head">
        <div style={{ display: "grid", gap: 8 }}>
          <h1 className="admin-title">Properties</h1>
          <p className="small">Buildings IRep manages, their units and who lives there. Owner details stay in the staff area.</p>
        </div>
        <Link className="btn primary" href="/admin/properties/new">
          Add Property
        </Link>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading properties…</p>
      ) : properties.length === 0 && !error ? (
        <div className="empty">
          <h2>No Properties Yet</h2>
          <p>Add the first property you manage. You can add its units and tenants after that.</p>
          <Link className="btn ghost" href="/admin/properties/new">
            Add the First Property
          </Link>
        </div>
      ) : properties.length ? (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="p-search">Search</label>
              <input
                id="p-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Address, owner name, email or phone"
              />
            </div>
            <div className="field">
              <label htmlFor="p-sort">Sort by</label>
              <select id="p-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="address">Address</option>
                <option value="renewal">Renewal date (soonest first)</option>
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived{archivedCount ? ` (${archivedCount})` : ""}
            </label>
          </div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn primary sm" onClick={sendInvites} disabled={!pickedHere.length || sending}>
              {sending
                ? "Sending…"
                : pickedHere.length
                  ? `Send Owner Portal Invitation to ${pickedHere.length}${resends ? ` (${resends} resend${resends === 1 ? "" : "s"})` : ""}`
                  : "Send Owner Portal Invitations"}
            </button>
            <span className="small">
              {pickableOwners.length
                ? "Tick properties below to invite their owners, or tick the box in the header for every owner who can be invited."
                : "No owners here can be invited: they've joined, have no email or unsubscribed."}
            </span>
            {notice.text ? (
              <span className={`small ${notice.kind}`} role={notice.kind === "err" ? "alert" : "status"}>
                {notice.text}
              </span>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <div className="empty">
              <p>No properties match {q ? <b>&ldquo;{query.trim()}&rdquo;</b> : "these filters"}.</p>
            </div>
          ) : (
            <div className="list table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        className="row-check"
                        checked={allOn}
                        disabled={!pickableOwners.length}
                        onChange={toggleAll}
                        aria-label="Choose every owner who can be invited"
                      />
                    </th>
                    <th scope="col">Address</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Package</th>
                    <th scope="col" className="num">Units</th>
                    <th scope="col">Fee</th>
                    <th scope="col" aria-sort={sort === "renewal" ? "ascending" : undefined}>
                      <button type="button" className="th-sort" onClick={() => setSort(sort === "renewal" ? "address" : "renewal")}>
                        Agreement{sort === "renewal" ? " ↑" : ""}
                      </button>
                    </th>
                    <th scope="col">Units on file</th>
                    <th scope="col" className="r">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const c = unitCounts(p.units);
                    return (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            className="row-check"
                            checked={Boolean(p.owner && picked.has(p.owner.id))}
                            disabled={!ownerInvitable(ownerOf(p), p)}
                            onChange={() => togglePick(p.owner.id)}
                            aria-label={`Invite ${p.owner?.name || "the owner"} of ${p.address}`}
                          />
                        </td>
                        <td className="addr">
                          <Link className="addr-street addr-link" href={`/admin/properties/${p.id}`}>
                            {p.address}
                          </Link>
                          {p.city ? <span className="small addr-city">{p.city}</span> : null}
                          {p.archived ? <span className="pill us-offline inline-pill">Archived</span> : null}
                        </td>
                        <td>
                          {p.owner ? (
                            <>
                              <Link href={`/admin/owners/${p.owner.id}`}>{p.owner.name}</Link>
                              <span className="sub-line">
                                <OwnerPortal o={ownerOf(p)} />
                              </span>
                            </>
                          ) : (
                            <span className="small">Not set</span>
                          )}
                        </td>
                        <td>{PACKAGE_LABEL[p.management_package] || <span className="small">Not set</span>}</td>
                        <td className="num">{p.unit_count ?? 1}</td>
                        <td className="num">
                          {p.monthly_fee !== null && p.monthly_fee !== undefined ? (
                            <>
                              {money(p.monthly_fee)}
                              <span className="small"> + HST</span>
                              {p.custom_fee ? <span className="pill us-offline inline-pill">Custom</span> : null}
                            </>
                          ) : (
                            <span className="small">Not set</span>
                          )}
                        </td>
                        <td>
                          <RenewalBadge date={p.agreement_renewal} />
                        </td>
                        <td className="unit-counts">
                          {p.units?.length ? (
                            <>
                              {c.occupied ? <span className="uc uc-occupied">{c.occupied} occupied</span> : null}
                              {c.vacant ? <span className="uc uc-vacant">{c.vacant} vacant</span> : null}
                              {c.turnover ? <span className="uc uc-turnover">{c.turnover} turnover</span> : null}
                              {c.offline ? <span className="uc uc-offline">{c.offline} offline</span> : null}
                            </>
                          ) : (
                            <span className="small">No units yet</span>
                          )}
                        </td>
                        <td className="r">
                          <Link className="btn ghost sm" href={`/admin/properties/${p.id}`}>
                            Open<span className="visually-hidden"> {propertyTitle(p)}</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
