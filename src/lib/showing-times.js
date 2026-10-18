// Showing times: a broad window, optionally narrowed to a 30-minute start time inside it.
// Stored in showing_requests.preferred_time / proposed_time as either the window
// ("Morning (9 am – 12 pm)") or the exact time ("10:30 am").
export const WINDOWS = ["Morning (9 am – 12 pm)", "Afternoon (12 – 5 pm)", "Evening (5 – 8 pm)"];
const RANGE = { Morning: [9, 12], Afternoon: [12, 17], Evening: [17, 20] };

export const isWindow = (t) => WINDOWS.includes(t);
const EXACT = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i;
export const isExactTime = (t) => {
  const m = EXACT.exec(String(t || "").trim());
  if (!m) return false;
  const mins = toMinutes(t);
  return Number(m[2]) % 30 === 0 && mins >= 9 * 60 && mins <= 19 * 60 + 30;
};

export function label(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// Minutes after midnight that a window or exact time starts.
export function toMinutes(t) {
  const m = EXACT.exec(String(t || "").trim());
  if (m) {
    let h = Number(m[1]) % 12;
    if (/pm/i.test(m[3])) h += 12;
    return h * 60 + Number(m[2]);
  }
  const key = String(t || "").split(" ")[0];
  return (RANGE[key]?.[0] ?? 12) * 60;
}

// The 30-minute start times inside a window: Morning gives 9:00 am to 11:30 am.
export function halfHours(window) {
  const r = RANGE[String(window || "").split(" ")[0]];
  if (!r) return [];
  const out = [];
  for (let m = r[0] * 60; m < r[1] * 60; m += 30) out.push(label(m));
  return out;
}

// Days with the windows and exact times that start late enough: 24 hours ahead, or later today if vacant.
export function showingSlots(vacant, days = 14) {
  const earliest = Date.now() + (vacant ? 0 : 24 * 3600 * 1000);
  const out = [];
  const today = new Date();
  for (let k = 0; k <= days; k++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const at = (mins) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(mins / 60), mins % 60).getTime();
    const windows = [];
    const times = {};
    const whole = {}; // the whole window still works (its start is late enough)
    for (const w of WINDOWS) {
      const ok = halfHours(w).filter((t) => at(toMinutes(t)) >= earliest);
      if (ok.length) {
        windows.push(w);
        times[w] = ok;
        whole[w] = at(toMinutes(w)) >= earliest;
      }
    }
    if (windows.length) out.push({ iso, label: d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }), windows, times, whole });
  }
  return out;
}
