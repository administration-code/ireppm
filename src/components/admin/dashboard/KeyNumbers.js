import { money } from "@/lib/format";
import { num, percent, plural } from "@/lib/dashboard";

export function ProgressBar({ value, label }) {
  return (
    <div className="dash-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function Tile({ label, value, zero, warn, children }) {
  return (
    <div className={`dash-tile${zero ? " zero" : ""}${warn ? " warn" : ""}`}>
      <span className="eyebrow">{label}</span>
      <span className="dash-value">{value}</span>
      {children}
    </div>
  );
}

export default function KeyNumbers({ data }) {
  const rent = data.rent || {};
  const arrears = data.arrears || {};
  const occ = data.occupancy || {};
  const income = data.irep_income || {};
  const collectedPct = percent(rent.collected, rent.expected);
  const occupiedPct = percent(occ.occupied, occ.units);
  const incomeTotal = num(income.management_fees) + num(income.leasing_fees);
  const unpaid = num(rent.tenancies_unpaid) + num(rent.tenancies_partial);

  return (
    <section aria-label="Key numbers" className="dash-tiles">
      <Tile label="Rent collected this month" value={money(rent.collected)} zero={!num(rent.collected)}>
        <span className="small">
          of {money(rent.expected)} expected · {collectedPct}%
        </span>
        <ProgressBar value={collectedPct} label={`${collectedPct}% of this month's rent collected`} />
        <span className="small">By the 7th: {money(rent.collected_by_7th)}</span>
      </Tile>

      <Tile label="Outstanding this month" value={money(rent.outstanding)} zero={!num(rent.outstanding)} warn={num(rent.outstanding) > 0}>
        <span className="small">
          {num(rent.tenancies_paid)} of {num(rent.tenancies_due)} paid
          {unpaid ? ` · ${num(rent.tenancies_unpaid)} unpaid, ${num(rent.tenancies_partial)} partial` : ""}
        </span>
      </Tile>

      <Tile label="Total arrears" value={money(arrears.total)} zero={!num(arrears.total)} warn={num(arrears.total) > 0}>
        <span className="small">{num(arrears.count) ? `${plural(num(arrears.count), "tenant")} behind` : "No tenants behind"}</span>
      </Tile>

      <Tile label="Occupancy" value={`${occupiedPct}%`} zero={!num(occ.units)}>
        <span className="small">
          {num(occ.occupied)} of {plural(num(occ.units), "unit")} occupied
        </span>
        <ProgressBar value={occupiedPct} label={`${occupiedPct}% of units occupied`} />
        <span className="small">
          {num(occ.vacant)} vacant · {num(occ.turnover)} in turnover · {num(occ.offline)} offline
        </span>
      </Tile>

      <Tile label="Monthly rent roll" value={money(occ.monthly_rent_roll)} zero={!num(occ.monthly_rent_roll)}>
        <span className="small">Across {plural(num(occ.properties), "managed property", "managed properties")}</span>
      </Tile>

      <Tile label="IRep income this month" value={money(incomeTotal)} zero={!incomeTotal}>
        <span className="small">
          Management {money(income.management_fees)} · Leasing {money(income.leasing_fees)}
        </span>
        <span className="small">Before HST</span>
      </Tile>
    </section>
  );
}
