"use client";

import { useState } from "react";

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy ${label} ${value}`}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function ContactLine({ phone, email }) {
  if (!phone && !email) return <p className="small">No contact details on file.</p>;
  return (
    <ul className="contact-line">
      {phone ? (
        <li>
          <a className="copyable" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
            {phone}
          </a>
          <CopyButton value={phone} label="phone" />
        </li>
      ) : null}
      {email ? (
        <li>
          <a className="copyable" href={`mailto:${email}`}>
            {email}
          </a>
          <CopyButton value={email} label="email" />
        </li>
      ) : null}
    </ul>
  );
}
