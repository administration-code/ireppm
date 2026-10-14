"use client";

import { useMemo, useState } from "react";
import ListingCard from "./ListingCard";
import { money } from "@/lib/format";

const TYPES = ["Any", "Apartment", "House", "Townhouse", "Room"];
const BEDS = ["Any", "1+", "2+", "3+"];
const MAXES = ["1000", "1500", "2000", "2500", "3000"];

export default function PropertySearch({ listings, sample, initial }) {
  const [q, setQ] = useState(initial.q || "");
  const [type, setType] = useState(TYPES.includes(initial.type) ? initial.type : "Any");
  const [beds, setBeds] = useState(BEDS.includes(initial.beds) ? initial.beds : "Any");
  const [max, setMax] = useState(MAXES.includes(initial.max) ? initial.max : "");

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return listings.filter((l) => {
      const hay = [l.address, l.unit, l.neighbourhood, l.city].filter(Boolean).join(" ").toLowerCase();
      if (needle && !hay.includes(needle)) return false;
      if (type !== "Any" && l.property_type !== type) return false;
      if (beds !== "Any" && Number(l.beds) < parseInt(beds, 10)) return false;
      if (max && Number(l.rent) > Number(max)) return false;
      return true;
    });
  }, [listings, q, type, beds, max]);

  function sync(next) {
    const p = new URLSearchParams();
    const v = { q, type, beds, max, ...next };
    if (v.q) p.set("q", v.q);
    if (v.type !== "Any") p.set("type", v.type);
    if (v.beds !== "Any") p.set("beds", v.beds);
    if (v.max) p.set("max", v.max);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/properties?${qs}` : "/properties");
  }

  return (
    <>
      <form className="filters" onSubmit={(e) => e.preventDefault()} role="search">
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label htmlFor="f-q">Search</label>
          <input
            id="f-q"
            value={q}
            placeholder="Street, neighbourhood or town"
            onChange={(e) => {
              setQ(e.target.value);
              sync({ q: e.target.value });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="f-type">Type</label>
          <select id="f-type" value={type} onChange={(e) => { setType(e.target.value); sync({ type: e.target.value }); }}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-beds">Bedrooms</label>
          <select id="f-beds" value={beds} onChange={(e) => { setBeds(e.target.value); sync({ beds: e.target.value }); }}>
            {BEDS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-max">Max rent</label>
          <select id="f-max" value={max} onChange={(e) => { setMax(e.target.value); sync({ max: e.target.value }); }}>
            <option value="">No limit</option>
            {MAXES.map((m) => (
              <option key={m} value={m}>
                {money(m)}
              </option>
            ))}
          </select>
        </div>
      </form>

      {listings.length === 0 ? (
        <div className="empty">
          <h3>No rentals available right now</h3>
          <p>New units are added here as soon as they're ready to show. Check back soon.</p>
        </div>
      ) : (
        <>
          <p className="count num" aria-live="polite">
            {results.length} of {listings.length} rentals
          </p>
          {results.length ? (
            <div className="cards">
              {results.map((l) => (
                <ListingCard key={l.id} listing={l} sample={sample} />
              ))}
            </div>
          ) : (
            <div className="empty">No rentals match those filters. Try a higher max rent or fewer bedrooms.</div>
          )}
        </>
      )}
    </>
  );
}
