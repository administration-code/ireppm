"use client";

import { useState } from "react";
import ContactLine from "@/components/admin/ContactLine";
import { INQUIRY_STATUS, prettyDateTime, updateRow } from "@/lib/admin-requests";

function InquiryItem({ inquiry, onChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const statusId = `i-status-${inquiry.id}`;

  async function setStatus(status) {
    setSaving(true);
    setError("");
    try {
      await updateRow("landlord_inquiries", inquiry.id, { status });
      onChange({ ...inquiry, status });
    } catch {
      setError("That didn't save. Try again.");
    }
    setSaving(false);
  }

  return (
    <li className="req">
      <div className="req-top">
        <div className="req-who">
          <h3>{inquiry.name}</h3>
          <ContactLine phone={inquiry.phone} email={inquiry.email} />
        </div>
        <div className="field req-status">
          <label htmlFor={statusId}>Status</label>
          <select
            id={statusId}
            value={inquiry.status}
            disabled={saving}
            onChange={(e) => setStatus(e.target.value)}
          >
            {Object.entries(INQUIRY_STATUS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <dl className="req-facts">
        <div>
          <dt>Property</dt>
          <dd>{inquiry.property_address || "Not given"}</dd>
        </div>
        <div>
          <dt>Interested in</dt>
          <dd>{inquiry.interest || "Not given"}</dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>{prettyDateTime(inquiry.created_at)}</dd>
        </div>
      </dl>

      {inquiry.message ? <p className="req-note">{inquiry.message}</p> : null}
      {error ? (
        <p className="small err" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export default function InquiriesPanel({ inquiries, onChange }) {
  if (!inquiries.length) {
    return (
      <div className="empty">
        <h2>No landlord inquiries yet</h2>
        <p>When an owner asks about property management through the website, their message will appear here.</p>
      </div>
    );
  }
  return (
    <ul className="req-list">
      {inquiries.map((q) => (
        <InquiryItem key={q.id} inquiry={q} onChange={onChange} />
      ))}
    </ul>
  );
}
