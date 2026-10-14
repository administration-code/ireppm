"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomeSearch({ count }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [beds, setBeds] = useState("Any");
  const [max, setMax] = useState("");

  function submit(e) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (beds !== "Any") p.set("beds", beds);
    if (max) p.set("max", max);
    const qs = p.toString();
    router.push(qs ? `/properties?${qs}` : "/properties");
  }

  return (
    <form className="panel-box" onSubmit={submit} role="search">
      <h3 style={{ fontSize: "1.35rem" }}>Find a place to rent</h3>
      <div className="field">
        <label htmlFor="h-q">Neighbourhood or street</label>
        <input id="h-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Walkerville, University, Ouellette" />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="h-beds">Bedrooms</label>
          <select id="h-beds" value={beds} onChange={(e) => setBeds(e.target.value)}>
            <option>Any</option>
            <option>1+</option>
            <option>2+</option>
            <option>3+</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="h-max">Max rent</label>
          <select id="h-max" value={max} onChange={(e) => setMax(e.target.value)}>
            <option value="">No limit</option>
            <option value="1000">$1,000</option>
            <option value="1500">$1,500</option>
            <option value="2000">$2,000</option>
            <option value="2500">$2,500</option>
            <option value="3000">$3,000</option>
          </select>
        </div>
      </div>
      <button className="btn primary" type="submit">
        {count ? `Search ${count} rental${count === 1 ? "" : "s"}` : "Search rentals"}
      </button>
    </form>
  );
}
