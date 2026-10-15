"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/rent";
import { NOTICE_FIELDS, NOTICE_STATUS, SERVICE_METHODS, amountLabel, effectiveLabel, noticeName } from "@/lib/notices";
import NoticeForm from "./NoticeForm";

const byServed = (a, b) => String(b.served_on).localeCompare(String(a.served_on));

export function NoticeStatus({ status }) {
  return <span className={`pill ns-${status}`}>{NOTICE_STATUS[status] || status}</span>;
}

export default function NoticesPanel({ tenancyId }) {
  const [state, setState] = useState({ loading: true, notices: [], error: "" });
  const [editing, setEditing] = useState(null); // "new" or a notice id
  const [voidError, setVoidError] = useState("");

  useEffect(() => {
    let alive = true;
    getBrowserClient()
      .from("notices")
      .select(NOTICE_FIELDS)
      .eq("tenancy_id", tenancyId)
      .then(({ data, error }) => {
        if (!alive) return;
        setState({
          loading: false,
          notices: (data || []).sort(byServed),
          error: error ? "We couldn't load notices. Refresh the page to try again." : "",
        });
      });
    return () => {
      alive = false;
    };
  }, [tenancyId]);

  const saved = (n) => {
    setState((s) => ({ ...s, notices: [n, ...s.notices.filter((x) => x.id !== n.id)].sort(byServed) }));
    setEditing(null);
  };

  async function voidNotice(n) {
    if (!window.confirm(`Void the ${noticeName(n)} served ${shortDate(n.served_on)}?`)) return;
    setVoidError("");
    const { data, error } = await getBrowserClient()
      .from("notices")
      .update({ status: "void" })
      .eq("id", n.id)
      .select(NOTICE_FIELDS);
    if (error || !data?.length) return setVoidError("That didn't save. Try again.");
    saved(data[0]);
  }

  const { loading, notices, error } = state;

  return (
    <section className="boxed stack" aria-labelledby={`sec-notices-${tenancyId}`}>
      <div className="req-top">
        <h2 id={`sec-notices-${tenancyId}`} className="sec-title">
          Notices
        </h2>
        {editing !== "new" ? (
          <button type="button" className="btn ghost sm" onClick={() => setEditing("new")}>
            Log a notice
          </button>
        ) : null}
      </div>

      {error || voidError ? <div className="warnbox">{error || voidError}</div> : null}

      {editing === "new" ? (
        <NoticeForm tenancyId={tenancyId} onSaved={saved} onCancel={() => setEditing(null)} />
      ) : null}

      {loading ? (
        <p className="small">Loading notices…</p>
      ) : !notices.length ? (
        <p className="small">No notices logged for this tenancy.</p>
      ) : (
        <ul className="req-list">
          {notices.map((n) =>
            editing === n.id ? (
              <li key={n.id} className="req">
                <NoticeForm tenancyId={tenancyId} notice={n} onSaved={saved} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={n.id} className={`req${n.status === "void" ? " is-void" : ""}`}>
                <div className="req-top">
                  <b>{noticeName(n)}</b>
                  <NoticeStatus status={n.status} />
                </div>
                <dl className="req-facts">
                  <div>
                    <dt>Served</dt>
                    <dd>
                      {shortDate(n.served_on)}
                      {n.service_method ? ` · ${SERVICE_METHODS[n.service_method]}` : ""}
                      {n.served_by ? ` · by ${n.served_by}` : ""}
                    </dd>
                  </div>
                  {n.effective_date ? (
                    <div>
                      <dt>{effectiveLabel(n.form)}</dt>
                      <dd>{shortDate(n.effective_date)}</dd>
                    </div>
                  ) : null}
                  {n.amount != null ? (
                    <div>
                      <dt>{amountLabel(n.form)}</dt>
                      <dd className="num">{money(n.amount)}</dd>
                    </div>
                  ) : null}
                  {n.ltb_file_number ? (
                    <div>
                      <dt>LTB file</dt>
                      <dd>{n.ltb_file_number}</dd>
                    </div>
                  ) : null}
                </dl>
                {n.notes ? <p className="small pre-line">{n.notes}</p> : null}
                <div className="req-actions">
                  <button type="button" className="btn ghost sm" onClick={() => setEditing(n.id)}>
                    Edit
                  </button>
                  {n.status !== "void" ? (
                    <button type="button" className="btn ghost sm" onClick={() => voidNotice(n)}>
                      Void
                    </button>
                  ) : null}
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}
