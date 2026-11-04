"use client";

import { APPLIANCES, CONDITION, GUTTER, yesNo } from "@/lib/inspection-reports";

const tone = (v) => (v === "needs_replacement" ? "err" : undefined);

// Read-only property and unit checks from an inspection report.
// checks: { furnace_filter_swapped, water_valve_set, gutter_condition, pests, pests_note }
// units: [{ label, stove, fridge, washer, dryer, notes }]
export default function InspectionChecks({ checks, units }) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <dl className="req-facts">
        <div>
          <dt>Furnace filter swapped</dt>
          <dd>{yesNo(checks.furnace_filter_swapped)}</dd>
        </div>
        <div>
          <dt>Water shut-off valve set for the season</dt>
          <dd>{yesNo(checks.water_valve_set)}</dd>
        </div>
        <div>
          <dt>Gutters</dt>
          <dd className={tone(checks.gutter_condition)}>{GUTTER[checks.gutter_condition] || "Not checked"}</dd>
        </div>
        <div>
          <dt>Signs of pests</dt>
          <dd className={checks.pests ? "err" : undefined}>
            {yesNo(checks.pests)}
            {checks.pests && checks.pests_note ? `: ${checks.pests_note}` : ""}
          </dd>
        </div>
      </dl>
      {units?.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Unit</th>
                {APPLIANCES.map(([k, l]) => (
                  <th key={k} scope="col">
                    {l}
                  </th>
                ))}
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={i}>
                  <th scope="row">{u.label || "Main unit"}</th>
                  {APPLIANCES.map(([k]) => (
                    <td key={k} className={tone(u[k])}>
                      {CONDITION[u[k]] || "—"}
                    </td>
                  ))}
                  <td>{u.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
