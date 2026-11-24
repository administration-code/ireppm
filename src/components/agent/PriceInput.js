"use client";

import TapPick from "./TapPick";

const HST = 1.13;
const fmt = (n) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Chuck's price with no HST math: he types the amount and taps whether it already includes HST (or No charge).
// value: { amount, mode: "before" | "includes" | "none" }. onChange gets that plus price (before HST, as text)
// and no_charge, which is what the server stores.
export function priceBeforeHst(amount, mode) {
  const n = Number(amount);
  if (mode === "none" || !(n > 0)) return "";
  return (mode === "includes" ? Math.round((n / HST) * 100) / 100 : n).toFixed(2);
}

export default function PriceInput({ value, onChange }) {
  const mode = value.mode || "before";
  const emit = (next) => {
    const v = { ...value, mode, ...next };
    onChange({ ...v, price: priceBeforeHst(v.amount, v.mode), no_charge: v.mode === "none" });
  };
  const before = Number(priceBeforeHst(value.amount, mode)) || 0;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <TapPick
        label="Your price"
        options={[
          ["before", "Before HST"],
          ["includes", "Includes HST"],
          ["none", "No charge"],
        ]}
        value={mode}
        onChange={(m) => emit({ mode: m || "before", amount: m === "none" ? "" : value.amount })}
      />
      {mode !== "none" ? (
        <>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">{mode === "includes" ? "Total with HST (what the receipt says)" : "Amount before HST"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "1.2rem" }}>$</span>
              <input
                inputMode="decimal"
                value={value.amount || ""}
                onChange={(e) => emit({ amount: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="0.00"
                style={{ width: 140, minHeight: 48, fontSize: "1.15rem" }}
              />
            </span>
          </label>
          {before > 0 ? (
            <span className="small">
              {mode === "includes" ? `= ${fmt(before)} before HST + ${fmt(Number(value.amount) - before)} HST` : `+ HST ${fmt(before * 0.13)} = ${fmt(before * HST)} total`}
            </span>
          ) : null}
        </>
      ) : (
        <span className="small">No charge for this one.</span>
      )}
    </div>
  );
}
