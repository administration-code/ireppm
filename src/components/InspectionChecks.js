"use client";

import { APPLIANCES, CONDITION, GUTTER, PHOTO_PARTS, ROOF, yesNo } from "@/lib/inspection-reports";

const tone = (v) => (v === "needs_replacement" || v === "needs_repair" ? "err" : undefined);
const isVideo = (p) => /\.(mp4|mov|m4v|webm|3gp)$/i.test(p?.name || p?.path || "");

// Small photo thumbnails; urls maps each storage path to a viewing link.
export function PhotoStrip({ photos, urls, label }) {
  const list = (photos || []).filter((p) => urls?.[p.path]);
  if (!list.length) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {label ? <span className="small">{label}</span> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {list.map((p) => (
          <a key={p.path} href={urls[p.path]} target="_blank" rel="noreferrer" title={p.name || "Photo"}>
            {isVideo(p) ? (
              <span className="btn ghost sm">▶ Video</span>
            ) : (
              <img src={urls[p.path]} alt={label ? `${label} photo` : "Photo"} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 6 }} />
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

// Read-only property and unit checks from an inspection report, with each part's photos.
// checks: { furnace_filter_swapped, water_valve_set, gutter_condition, roof_condition, pests, pests_note, photos }
// units: [{ label, stove, fridge, washer, dryer, notes, photos }]; urls: { [path]: link }
export default function InspectionChecks({ checks, units, urls = {} }) {
  const photos = checks.photos || {};
  const hasPartPhotos = PHOTO_PARTS.some(([k]) => (photos[k] || []).some((p) => urls[p.path]));
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
        {checks.roof_condition ? (
          <div>
            <dt>Roof</dt>
            <dd className={tone(checks.roof_condition)}>{ROOF[checks.roof_condition]}</dd>
          </div>
        ) : null}
        <div>
          <dt>Signs of pests</dt>
          <dd className={checks.pests ? "err" : undefined}>
            {yesNo(checks.pests)}
            {checks.pests && checks.pests_note ? `: ${checks.pests_note}` : ""}
          </dd>
        </div>
      </dl>
      {hasPartPhotos ? (
        <div className="stack" style={{ gap: 10 }}>
          {PHOTO_PARTS.map(([k, l]) => (
            <PhotoStrip key={k} photos={photos[k]} urls={urls} label={l} />
          ))}
        </div>
      ) : null}
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
      {(units || []).map((u, i) =>
        [...APPLIANCES, ["notes", "Other"]].some(([k]) => (u.photos?.[k] || []).some((p) => urls[p.path])) ? (
          <div key={`p${i}`} className="stack" style={{ gap: 8 }}>
            <b className="small">{u.label || "Main unit"}: photos</b>
            {[...APPLIANCES, ["notes", "Other"]].map(([k, l]) => (
              <PhotoStrip key={k} photos={u.photos?.[k]} urls={urls} label={l} />
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}
