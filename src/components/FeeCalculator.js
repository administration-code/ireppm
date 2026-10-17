"use client";

import { useState } from "react";
import Link from "next/link";
import { CALC } from "@/lib/site";

const fmt = (n) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export default function FeeCalculator() {
  const [pkg, setPkg] = useState("standard");
  const [units, setUnits] = useState(1);
  const [rent, setRent] = useState("");
  const [addons, setAddons] = useState({});

  const p = CALC.packages.find((x) => x.key === pkg);
  const n = Math.max(1, Math.min(50, Number(units) || 1));
  const extra = (n - 1) * CALC.perUnit;
  const chosen = CALC.addons.filter((a) => addons[a.key] && !a.includedIn.includes(pkg));
  const addonTotal = chosen.reduce((s, a) => s + a.amount, 0);
  const monthly = p.base + extra + addonTotal;
  const withHst = Math.round(monthly * (1 + CALC.hst / 100) * 100) / 100;
  const rentNum = Number(String(rent).replace(/[^0-9.]/g, "")) || 0;
  const leasing = rentNum ? Math.round(rentNum * CALC.leasingMonths * 100) / 100 : 0;

  return (
    <div className="calc">
      <form className="calc-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset className="calc-pkgs">
          <legend>Package</legend>
          {CALC.packages.map((x) => (
            <label key={x.key} className={pkg === x.key ? "calc-pkg on" : "calc-pkg"}>
              <input type="radio" name="calc-pkg" value={x.key} checked={pkg === x.key} onChange={() => setPkg(x.key)} />
              <span>{x.name}</span>
              <small>{fmt(x.base)}/mo</small>
            </label>
          ))}
        </fieldset>
        <div className="row2">
          <div className="field">
            <label htmlFor="calc-units">Units at the property</label>
            <input id="calc-units" type="number" min="1" max="50" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="calc-rent">Monthly rent per unit (optional)</label>
            <input id="calc-rent" inputMode="decimal" placeholder="e.g. 1,800" value={rent} onChange={(e) => setRent(e.target.value)} />
          </div>
        </div>
        <fieldset className="calc-addons">
          <legend>Add-ons</legend>
          {CALC.addons.map((a) => {
            const included = a.includedIn.includes(pkg);
            return (
              <label key={a.key} className="check">
                <input
                  type="checkbox"
                  checked={included || Boolean(addons[a.key])}
                  disabled={included}
                  onChange={(e) => setAddons((x) => ({ ...x, [a.key]: e.target.checked }))}
                />
                <span>
                  {a.name} <span className="pmuted">{included ? "included" : `+${fmt(a.amount)}/mo`}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </form>

      <div className="calc-out" aria-live="polite">
        <span className="eyebrow">Your monthly fee</span>
        <div className="calc-total num">
          {fmt(monthly)}
          <small> / month + HST</small>
        </div>
        <dl className="calc-lines">
          <div><dt>{p.name} package, first unit</dt><dd className="num">{fmt(p.base)}</dd></div>
          {extra ? <div><dt>{n - 1} more {n - 1 === 1 ? "unit" : "units"} × {fmt(CALC.perUnit)}</dt><dd className="num">{fmt(extra)}</dd></div> : null}
          {chosen.map((a) => (
            <div key={a.key}><dt>{a.name.replace(/ \(.*\)$/, "")}</dt><dd className="num">{fmt(a.amount)}</dd></div>
          ))}
          <div className="calc-hst"><dt>With {CALC.hst}% HST</dt><dd className="num">{fmt(withHst)}</dd></div>
        </dl>
        <p className="pmuted calc-note">
          {leasing
            ? `Placing a tenant: ${fmt(leasing)} + HST per unit, once, when they move in (half of one month's rent).`
            : "Placing a tenant costs half of one month's rent + HST, once, when they move in."}{" "}
          After the first year your agreement carries on month to month at the same rate.
        </p>
        <Link className="btn primary" href="/landlords#estimate">
          Get a free rent estimate
        </Link>
      </div>
    </div>
  );
}
