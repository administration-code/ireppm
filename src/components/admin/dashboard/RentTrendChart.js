import { money } from "@/lib/format";
import { monthLabel } from "@/lib/rent";
import { num, percent } from "@/lib/dashboard";

function shortMonth(month) {
  const d = new Date(`${String(month).slice(0, 7)}-01T12:00:00`);
  return Number.isNaN(d.getTime()) ? String(month) : d.toLocaleDateString("en-CA", { month: "short" });
}

export default function RentTrendChart({ trend }) {
  const months = (trend || []).filter((m) => num(m.expected) > 0 || num(m.collected) > 0);
  const max = Math.max(1, ...months.map((m) => Math.max(num(m.expected), num(m.collected))));
  const height = (v) => `${Math.max(num(v) > 0 ? 2 : 0, (num(v) / max) * 100)}%`;

  return (
    <section className="panel-box dash-section" aria-labelledby="dash-trend-title">
      <div className="dash-section-head">
        <h2 id="dash-trend-title">Rent Trend</h2>
        <div className="trend-legend small" aria-hidden="true">
          <span>
            <i className="key expected" /> Expected
          </span>
          <span>
            <i className="key collected" /> Collected
          </span>
        </div>
      </div>

      {months.length ? (
        <>
          <div className="trend" aria-hidden="true">
            {months.map((m) => (
              <div className="trend-month" key={m.month}>
                <span className="trend-pct small">{percent(m.collected, m.expected)}%</span>
                <div className="trend-bars">
                  <span className="trend-bar expected" style={{ height: height(m.expected) }} />
                  <span className="trend-bar collected" style={{ height: height(m.collected) }} />
                </div>
                <span className="trend-label small">{shortMonth(m.month)}</span>
              </div>
            ))}
          </div>
          <table className="visually-hidden">
            <caption>Rent expected and collected by month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Expected</th>
                <th scope="col">Collected</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{monthLabel(m.month)}</th>
                  <td>{money(m.expected)}</td>
                  <td>{money(m.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="small">No rent has been charged in the last six months.</p>
      )}
    </section>
  );
}
