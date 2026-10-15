import Link from "next/link";
import { BOARD_COLUMNS, TURNOVER_STATUS } from "@/lib/turnovers";
import { shortDate } from "@/lib/rent";
import { num, percent, place, plural } from "@/lib/dashboard";
import { ProgressBar } from "@/components/admin/dashboard/KeyNumbers";

export default function TurnoversSummary({ turnovers }) {
  const byStatus = turnovers?.by_status || {};
  const list = turnovers?.list || [];
  const stages = BOARD_COLUMNS?.length ? BOARD_COLUMNS : ["notice", "make_ready", "ready", "listed"];

  return (
    <section className="panel-box dash-section" aria-labelledby="dash-turnovers-title">
      <div className="dash-section-head">
        <h2 id="dash-turnovers-title">Turnovers</h2>
        <Link href="/admin/turnovers" className="small dash-link">
          {num(turnovers?.open) ? `${plural(num(turnovers.open), "open turnover")} →` : "Turnover board →"}
        </Link>
      </div>

      <dl className="dash-counts">
        {stages.map((s) => (
          <div key={s} className={num(byStatus[s]) ? "" : "zero"}>
            <dt>{TURNOVER_STATUS[s] || s}</dt>
            <dd>{num(byStatus[s])}</dd>
          </div>
        ))}
      </dl>

      {list.length ? (
        <ul className="dash-list">
          {list.map((t) => {
            const done = num(t.tasks_done);
            const total = num(t.tasks_total);
            const pct = percent(done, total);
            return (
              <li key={t.id}>
                <Link href={`/admin/turnovers/${t.id}`} className="dash-turnover">
                  <span className="dash-turnover-main">
                    <span className="addr">{place(t.address, t.unit)}</span>
                    <span className="small">
                      {t.days_vacant != null
                        ? `${plural(num(t.days_vacant), "day")} vacant`
                        : t.move_out_date
                          ? `Moving out ${shortDate(t.move_out_date)}`
                          : "Move-out date not set"}
                    </span>
                  </span>
                  <span className={`pill tv-${t.status}`}>{TURNOVER_STATUS[t.status] || t.status}</span>
                  <span className="dash-turnover-progress">
                    <span className="small">{total ? `${done} of ${total} done` : "No checklist"}</span>
                    <ProgressBar value={pct} label={`Checklist ${pct}% done`} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small">No units are between tenants.</p>
      )}
    </section>
  );
}
