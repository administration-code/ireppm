"use client";

import { useState } from "react";
import Link from "next/link";
import ContactLine from "@/components/admin/ContactLine";
import { listingTitle } from "@/lib/format";
import { SHOWING_STATUS, prettyDateTime, prettyDay, updateRow } from "@/lib/admin-requests";

const ACTIONS = {
  requested: [
    { to: "confirmed", label: "Confirm", kind: "primary" },
    { to: "cancelled", label: "Cancel", kind: "ghost" },
  ],
  confirmed: [
    { to: "completed", label: "Mark completed", kind: "primary" },
    { to: "cancelled", label: "Cancel", kind: "ghost" },
  ],
  completed: [],
  cancelled: [],
};

function ShowingItem({ showing, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const renter = showing.renter || {};
  const listing = showing.listing;

  async function setStatus(status) {
    setBusy(true);
    setError("");
    const changes = { status };
    if (status === "confirmed") changes.confirmed_at = new Date().toISOString();
    try {
      await updateRow("showing_requests", showing.id, changes);
      onChange({ ...showing, ...changes });
    } catch {
      setError("That didn't save. Try again.");
    }
    setBusy(false);
  }

  return (
    <li className="req">
      <div className="req-top">
        <div className="req-who">
          <h3>{renter.full_name || "Renter (no name on file)"}</h3>
          <ContactLine phone={renter.phone} email={renter.email} />
        </div>
        <span className={`pill rs-${showing.status}`}>{SHOWING_STATUS[showing.status] || showing.status}</span>
      </div>

      <dl className="req-facts">
        <div>
          <dt>Listing</dt>
          <dd>
            {listing ? (
              listing.slug ? (
                <Link href={`/properties/${listing.slug}`}>{listingTitle(listing)}</Link>
              ) : (
                listingTitle(listing)
              )
            ) : (
              "Listing removed"
            )}
          </dd>
        </div>
        <div>
          <dt>Preferred</dt>
          <dd>
            {prettyDay(showing.preferred_date)}, {showing.preferred_time}
          </dd>
        </div>
        <div>
          <dt>Requested</dt>
          <dd>{prettyDateTime(showing.created_at)}</dd>
        </div>
        {showing.confirmed_at ? (
          <div>
            <dt>Confirmed</dt>
            <dd>{prettyDateTime(showing.confirmed_at)}</dd>
          </div>
        ) : null}
      </dl>

      {showing.notes ? <p className="req-note">{showing.notes}</p> : null}

      {ACTIONS[showing.status]?.length ? (
        <div className="req-actions">
          {ACTIONS[showing.status].map((a) => (
            <button
              key={a.to}
              type="button"
              className={`btn ${a.kind} sm`}
              disabled={busy}
              onClick={() => setStatus(a.to)}
            >
              {a.label}
            </button>
          ))}
          {error ? (
            <span className="small err" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function ShowingsPanel({ showings, onChange }) {
  if (!showings.length) {
    return (
      <div className="empty">
        <h2>No showing requests yet</h2>
        <p>When a renter asks to see a listing, their request and preferred time will appear here.</p>
      </div>
    );
  }
  return (
    <ul className="req-list">
      {showings.map((s) => (
        <ShowingItem key={s.id} showing={s} onChange={onChange} />
      ))}
    </ul>
  );
}
