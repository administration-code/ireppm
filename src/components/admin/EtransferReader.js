"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { SITE } from "@/lib/site";

const LEGACY_UNTIL = "Dec 31, 2026";
const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" }) : "Never";
const minutesAgo = (iso) => (iso ? Math.round((Date.now() - Date.parse(iso)) / 60000) : null);

// Settings: which Gmail mailbox the Interac e-Transfer reader runs in, when it last checked, and the last test.
export default function EtransferReader() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      getBrowserClient()
        .from("mail_feed_status")
        .select("*")
        .eq("feed", "interac")
        .order("role")
        .then(({ data, error: e }) => {
          setRows(data || []);
          setError(e ? "Couldn't load the reader status. If migration 0091 hasn't been run yet, run it first." : "");
        });
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const primary = (rows || []).find((r) => r.role === "primary");
  const live = primary && minutesAgo(primary.last_seen_at) !== null && minutesAgo(primary.last_seen_at) <= 15;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Staff · Settings</span>
        <h1 className="admin-title">e-Transfer Reader</h1>
        <p className="small" style={{ margin: 0 }}>
          Tenants send rent to {SITE.paymentEmail}. Interac&apos;s emails for that address are read by a small script in the mailbox below, every 5 minutes,
          and each e-Transfer is matched to a tenant here. Labelled &ldquo;Rent Recorded&rdquo; in Gmail once it&apos;s in.
        </p>
      </div>
      {error ? <div className="warnbox">{error}</div> : null}

      <section className={`boxed stack${live ? "" : " attention"}`} aria-labelledby="er-now">
        <h2 id="er-now" className="sec-title">
          Reading From
        </h2>
        {rows === null ? (
          <p className="small">Loading…</p>
        ) : primary ? (
          <>
            <p style={{ margin: 0, fontSize: "1.2rem" }}>
              <b>{primary.mailbox}</b>
            </p>
            <p className="small" style={{ margin: 0 }}>
              {live ? "✓ Running." : "⚠ Hasn't checked in for over 15 minutes. Open the script in that mailbox and run setup again."} Last checked {when(primary.last_seen_at)}.
            </p>
          </>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            The new reader isn&apos;t installed yet. Until it is, e-Transfers are only read from the old mailbox.
          </p>
        )}
      </section>

      <section className="boxed stack" aria-labelledby="er-all">
        <h2 id="er-all" className="sec-title">
          All Mailboxes
        </h2>
        {!rows?.length ? (
          <p className="small">No reader has checked in since this page was added. They show up within 5 minutes of running.</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Mailbox</th>
                  <th scope="col">Job</th>
                  <th scope="col">Last checked</th>
                  <th scope="col">Last e-Transfer sent in</th>
                  <th scope="col">Last test</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.mailbox}>
                    <td>{r.mailbox}</td>
                    <td className="small">
                      {r.role === "primary"
                        ? "Main reader: every e-Transfer to payment@ireppm.ca"
                        : `Old address only: flags and reminds anyone still sending there. Stops after ${LEGACY_UNTIL}.`}
                    </td>
                    <td className="small">{when(r.last_seen_at)}</td>
                    <td className="small">
                      {when(r.last_item_at)}
                      {r.items_total ? ` (${r.items_total} total)` : ""}
                    </td>
                    <td className="small">{r.last_test_at ? `${when(r.last_test_at)}: ${money(r.last_test_amount)} from ${r.last_test_from || "unknown"}` : "None yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="boxed stack" aria-labelledby="er-test">
        <h2 id="er-test" className="sec-title">
          Test It
        </h2>
        <p className="small" style={{ margin: 0 }}>
          Send a small e-Transfer to {SITE.paymentEmail} with <b>IREP TEST</b> in the message. Within about 5 minutes it shows under &ldquo;Last test&rdquo; on the
          mailbox that received it. It isn&apos;t recorded as rent and nobody is emailed. On the bank side it&apos;s an ordinary deposit: file it as a transfer when you
          reconcile.
        </p>
      </section>
    </div>
  );
}
