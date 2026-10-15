"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { prettyDate } from "@/lib/admin-properties";
import { STATUS_LABEL as LISTING_STATUS } from "@/lib/admin-listings";
import {
  BOARD_COLUMNS,
  CLOSED_TURNOVER,
  OPEN_TURNOVER_FILTER,
  TURNOVER_SELECT,
  TURNOVER_STATUS,
  checklistProgress,
  daysVacant,
  primaryTenant,
  relativeDays,
  setTurnoverStatus,
} from "@/lib/turnovers";

const BOARD_SELECT = `${TURNOVER_SELECT}, tasks:turnover_tasks(id, done, not_needed)`;

async function loadBoard() {
  const sb = getBrowserClient();
  const [open, closed] = await Promise.all([
    sb.from("turnovers").select(BOARD_SELECT).not("status", "in", OPEN_TURNOVER_FILTER).order("move_out_date", { ascending: true, nullsFirst: false }),
    sb.from("turnovers").select(BOARD_SELECT).in("status", CLOSED_TURNOVER).order("updated_at", { ascending: false }).limit(50),
  ]);
  return {
    open: open.data || [],
    closed: closed.data || [],
    error: open.error || closed.error ? "We couldn't load turnovers. Refresh the page to try again." : "",
  };
}

const place = (t) => [t.unit?.property?.address, t.unit?.label].filter(Boolean).join(" · ") || "Unknown unit";

function TurnoverCard({ turnover, onMoved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const index = BOARD_COLUMNS.indexOf(turnover.status);
  const prev = index > 0 ? BOARD_COLUMNS[index - 1] : null;
  const next = index >= 0 && index < BOARD_COLUMNS.length - 1 ? BOARD_COLUMNS[index + 1] : null;
  const { finished, total } = checklistProgress(turnover.tasks);
  const vacant = daysVacant(turnover);
  const tenant = primaryTenant(turnover.ended_tenancy);
  const listing = turnover.unit?.listing;

  async function move(status) {
    setBusy(true);
    setError("");
    try {
      const saved = await setTurnoverStatus(turnover.id, status);
      onMoved({ ...turnover, ...saved });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <li className="turn-card">
      <Link href={`/admin/turnovers/${turnover.id}`} className="turn-card-title">
        <b>{place(turnover)}</b>
      </Link>
      <dl className="turn-facts">
        <div>
          <dt>Previous tenant</dt>
          <dd>{tenant || "—"}</dd>
        </div>
        <div>
          <dt>Move-out</dt>
          <dd>
            {turnover.move_out_date ? (
              <>
                {prettyDate(turnover.move_out_date)} <span className="small">({relativeDays(turnover.move_out_date)})</span>
              </>
            ) : (
              "Not set"
            )}
          </dd>
        </div>
        <div>
          <dt>Days vacant</dt>
          <dd className="num">{vacant === null ? "Not vacant yet" : vacant}</dd>
        </div>
        <div>
          <dt>Checklist</dt>
          <dd>
            {total ? (
              <>
                <span className="num">
                  {finished} / {total}
                </span>
                <span className="turn-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((finished / total) * 100)}%` }} />
                </span>
              </>
            ) : (
              "No checklist"
            )}
          </dd>
        </div>
        <div>
          <dt>Target ready</dt>
          <dd>{turnover.target_ready_date ? prettyDate(turnover.target_ready_date) : "Not set"}</dd>
        </div>
        <div>
          <dt>Listing</dt>
          <dd>{listing ? LISTING_STATUS[listing.status] || listing.status : "No listing"}</dd>
        </div>
      </dl>
      {prev || next ? (
        <div className="turn-moves">
          {prev ? (
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => move(prev)}>
              ← {TURNOVER_STATUS[prev]}
            </button>
          ) : null}
          {next ? (
            <button type="button" className="btn primary sm" disabled={busy} onClick={() => move(next)}>
              {TURNOVER_STATUS[next]} →
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="small err" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export default function TurnoversBoard() {
  const [state, setState] = useState({ loading: true, open: [], closed: [], error: "" });
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBoard().then(
      (data) => alive && setState({ loading: false, ...data }),
      () => alive && setState((s) => ({ ...s, loading: false, error: "We couldn't load turnovers. Refresh the page to try again." }))
    );
    return () => {
      alive = false;
    };
  }, []);

  const moved = (item) => setState((s) => ({ ...s, open: s.open.map((t) => (t.id === item.id ? item : t)) }));
  const { loading, open, closed, error } = state;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <Link className="back" href="/admin">
          ← Staff
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="eyebrow">Staff · Turnovers</span>
            <h1 className="admin-title">Turnovers</h1>
            <p className="small">
              Units between tenants, from notice through make-ready to leased. A turnover opens when a tenant gives notice
              and closes when the next tenancy starts.
            </p>
          </div>
        </div>
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {loading ? (
        <p className="small">Loading turnovers…</p>
      ) : (
        <div className="turn-board">
          {BOARD_COLUMNS.map((col) => {
            const cards = open.filter((t) => t.status === col);
            return (
              <section key={col} className="turn-col" aria-labelledby={`col-${col}`}>
                <h2 id={`col-${col}`} className="turn-col-title">
                  {TURNOVER_STATUS[col]} <span className="count">{cards.length}</span>
                </h2>
                {cards.length ? (
                  <ul className="turn-cards">
                    {cards.map((t) => (
                      <TurnoverCard key={t.id} turnover={t} onMoved={moved} />
                    ))}
                  </ul>
                ) : (
                  <p className="small">None right now.</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {!loading ? (
        <section className="stack" aria-labelledby="sec-closed">
          <div className="sec-head">
            <h2 id="sec-closed" className="sec-title">
              Closed
            </h2>
            <button type="button" className="btn ghost sm" aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)}>
              {showClosed ? "Hide closed" : `Show closed (${closed.length})`}
            </button>
          </div>
          {showClosed ? (
            closed.length ? (
              <ul className="maint-list">
                {closed.map((t) => (
                  <li key={t.id}>
                    <div>
                      <Link href={`/admin/turnovers/${t.id}`}>
                        <b>{place(t)}</b>
                      </Link>
                      <span className="small sub-line">
                        {[
                          primaryTenant(t.ended_tenancy) ? `Previous tenant ${primaryTenant(t.ended_tenancy)}` : "",
                          t.move_out_date ? `Moved out ${prettyDate(t.move_out_date)}` : "",
                          t.leased_on ? `Leased ${prettyDate(t.leased_on)}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <span className={`pill tv-${t.status}`}>{TURNOVER_STATUS[t.status]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">No closed turnovers yet.</p>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
