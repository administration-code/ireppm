"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { listingTitle } from "@/lib/format";
import {
  PHOTO_BUCKET,
  PROPERTY_TYPES,
  SAVED_MESSAGE,
  STATUS_LABEL,
  photoPathFromUrl,
  slugify,
} from "@/lib/admin-listings";
import PhotoManager from "./PhotoManager";
import FeaturesEditor from "./FeaturesEditor";
import AddressInput from "@/components/AddressInput";
import {
  LAUNDRY_OPTIONS,
  PARKING_OPTIONS,
  UTILITIES,
  laundryText,
  parkingText,
  utilitiesText,
} from "@/lib/listing-details";

const text = (v) => (v === null || v === undefined ? "" : String(v));

function toForm(l) {
  return {
    address: text(l?.address),
    unit: text(l?.unit),
    neighbourhood: text(l?.neighbourhood),
    city: l ? text(l.city) : "Windsor",
    property_type: l?.property_type || "Apartment",
    beds: l ? text(l.beds) : "1",
    baths: l ? text(l.baths) : "1",
    sqft: text(l?.sqft),
    rent: text(l?.rent),
    available_on: text(l?.available_on),
    utilities: text(l?.utilities),
    parking: text(l?.parking),
    laundry: text(l?.laundry),
    utilities_included: l?.utilities_included || [],
    parking_option: text(l?.parking_option),
    parking_spots: text(l?.parking_spots),
    parking_instructions: text(l?.parking_instructions),
    laundry_option: text(l?.laundry_option),
    description: text(l?.description),
    features: l?.features || [],
    photos: l?.photos || [],
  };
}

const orNull = (v) => (v.trim() ? v.trim() : null);

function validate(f) {
  if (!f.address.trim()) return "Add the street address.";
  if (!/^\d+$/.test(f.rent.trim()) || Number(f.rent) <= 0) return "Enter the monthly rent in whole dollars, like 1850.";
  for (const [key, label] of [
    ["beds", "Bedrooms"],
    ["baths", "Bathrooms"],
  ]) {
    const n = Number(f[key]);
    if (f[key].trim() === "" || !Number.isFinite(n) || n < 0 || n > 99) return `${label} must be a number from 0 to 99.`;
  }
  if (f.sqft.trim() && (!/^\d+$/.test(f.sqft.trim()) || Number(f.sqft) <= 0))
    return "Square feet must be a whole number, or leave it blank.";
  if (f.parking_spots.trim() && (!/^\d+$/.test(f.parking_spots.trim()) || Number(f.parking_spots) > 50))
    return "Parking spots must be a whole number from 0 to 50.";
  return "";
}

function toRow(f, status) {
  return {
    address: f.address.trim(),
    unit: orNull(f.unit),
    neighbourhood: orNull(f.neighbourhood),
    city: f.city.trim() || "Windsor",
    property_type: f.property_type,
    beds: Math.round(Number(f.beds) * 10) / 10,
    baths: Math.round(Number(f.baths) * 10) / 10,
    sqft: f.sqft.trim() ? parseInt(f.sqft, 10) : null,
    rent: parseInt(f.rent, 10),
    available_on: f.available_on || null,
    // The public page shows these words; the structured choices are kept for editing.
    utilities: f.utilities_included.length ? utilitiesText(f.utilities_included) : orNull(f.utilities),
    parking: f.parking_option ? parkingText(f.parking_option, f.parking_spots) : orNull(f.parking),
    laundry: f.laundry_option ? laundryText(f.laundry_option) : orNull(f.laundry),
    utilities_included: f.utilities_included,
    parking_option: f.parking_option || null,
    parking_spots: ["included", "assigned"].includes(f.parking_option) && f.parking_spots.trim() ? parseInt(f.parking_spots, 10) : null,
    parking_instructions: ["included", "assigned"].includes(f.parking_option) ? orNull(f.parking_instructions) : null,
    laundry_option: f.laundry_option || null,
    description: orNull(f.description),
    features: f.features,
    photos: f.photos,
    status,
  };
}

export default function ListingForm({ listing, saved, prefill, unitId }) {
  const router = useRouter();
  const isNew = !listing;
  const [form, setForm] = useState(() => (listing ? toForm(listing) : { ...toForm(null), ...prefill }));
  const [status, setStatus] = useState(listing?.status || "draft");
  const [saving, setSaving] = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(saved && SAVED_MESSAGE[saved] ? SAVED_MESSAGE[saved] : "");
  const [error, setError] = useState("");
  const savedPhotos = useRef(new Set(listing?.photos || []));
  const sessionUploads = useRef(new Set());
  const [folder] = useState(() => listing?.id || `new-${crypto.randomUUID()}`);

  const update = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setMsg("");
  };
  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: typeof value === "function" ? value(f[key]) : value }));
    setMsg("");
  };

  async function removeUnusedPhotos(finalPhotos) {
    const keep = new Set(finalPhotos);
    const unused = [...savedPhotos.current, ...sessionUploads.current].filter((url) => !keep.has(url));
    const paths = unused.map(photoPathFromUrl).filter(Boolean);
    if (paths.length) await getBrowserClient().storage.from(PHOTO_BUCKET).remove(paths);
    savedPhotos.current = keep;
    sessionUploads.current = new Set();
  }

  async function save(nextStatus) {
    setError("");
    setMsg("");
    const problem = validate(form);
    if (problem) return setError(problem);
    if (uploading) return setError("Wait for the photos to finish uploading, then save.");

    const sb = getBrowserClient();
    const row = toRow(form, nextStatus);
    setSaving(nextStatus);

    let result;
    if (isNew) {
      const base = slugify([row.address, row.unit].filter(Boolean).join(" ")) || "listing";
      result = await sb.from("listings").insert({ ...row, slug: base }).select("id").single();
      if (result.error?.code === "23505") {
        const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        result = await sb.from("listings").insert({ ...row, slug }).select("id").single();
      }
    } else {
      result = await sb.from("listings").update(row).eq("id", listing.id).select("id").single();
    }

    if (result.error) {
      setSaving("");
      return setError("We couldn't save this listing. Check the fields and try again.");
    }

    await removeUnusedPhotos(row.photos);

    if (isNew) {
      if (unitId) await sb.from("units").update({ listing_id: result.data.id }).eq("id", unitId);
      router.replace(`/admin/listings/${result.data.id}?saved=${nextStatus}`);
      return;
    }
    setSaving("");
    setStatus(nextStatus);
    setMsg(SAVED_MESSAGE[nextStatus]);
  }

  const title = isNew ? "New listing" : listingTitle(listing);
  const busy = Boolean(saving);

  return (
    <form className="admin-form" onSubmit={(e) => e.preventDefault()} noValidate>
      <div>
        <Link className="back" href="/admin/listings">
          ← All listings
        </Link>
        <div className="admin-head">
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="eyebrow">{isNew ? "Staff · Create" : "Staff · Edit"}</span>
            <h1 className="admin-title">{title}</h1>
          </div>
          <div className="row">
            <span className={`pill st-${status}`}>{STATUS_LABEL[status] || status}</span>
            {!isNew && status === "available" ? (
              <Link className="btn ghost sm" href={`/properties/${listing.slug}`} target="_blank">
                View on Site
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <section className="boxed stack" aria-labelledby="sec-location">
        <h2 id="sec-location" className="sec-title">
          Location
        </h2>
        <div className="row2">
          <div className="field">
            <label htmlFor="f-address">Street address</label>
            <AddressInput
              id="f-address"
              value={form.address}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))}
              onSelect={(a) => setForm((f) => ({ ...f, address: a.line || f.address, city: a.city || f.city, unit: f.unit || a.unit }))}
              placeholder="1234 Ouellette Ave"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="f-unit">Unit (optional)</label>
            <input id="f-unit" value={form.unit} onChange={update("unit")} placeholder="Unit 2" />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="f-neighbourhood">Neighbourhood</label>
            <input id="f-neighbourhood" value={form.neighbourhood} onChange={update("neighbourhood")} placeholder="Walkerville" />
          </div>
          <div className="field">
            <label htmlFor="f-city">City</label>
            <input id="f-city" value={form.city} onChange={update("city")} />
          </div>
        </div>
        {isNew ? (
          <p className="small">
            Web address:{" "}
            <span className="num">/properties/{slugify([form.address, form.unit].filter(Boolean).join(" ")) || "…"}</span>
          </p>
        ) : null}
      </section>

      <section className="boxed stack" aria-labelledby="sec-details">
        <h2 id="sec-details" className="sec-title">
          The Rental
        </h2>
        <div className="row4">
          <div className="field">
            <label htmlFor="f-type">Property type</label>
            <select id="f-type" value={form.property_type} onChange={update("property_type")}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-beds">Bedrooms</label>
            <input id="f-beds" type="number" inputMode="decimal" min="0" max="99" step="0.5" value={form.beds} onChange={update("beds")} />
          </div>
          <div className="field">
            <label htmlFor="f-baths">Bathrooms</label>
            <input id="f-baths" type="number" inputMode="decimal" min="0" max="99" step="0.5" value={form.baths} onChange={update("baths")} />
          </div>
          <div className="field">
            <label htmlFor="f-sqft">Square feet (optional)</label>
            <input id="f-sqft" type="number" inputMode="numeric" min="1" step="1" value={form.sqft} onChange={update("sqft")} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="f-rent">Monthly rent (CAD, whole dollars)</label>
            <input id="f-rent" type="number" inputMode="numeric" min="1" step="1" value={form.rent} onChange={update("rent")} placeholder="1850" required />
          </div>
          <div className="field">
            <label htmlFor="f-available">Available from</label>
            <input id="f-available" type="date" value={form.available_on} onChange={update("available_on")} />
            <span className="small">Leave empty if it&apos;s available now.</span>
          </div>
        </div>
        <fieldset className="field">
          <legend>Utilities Included in the Rent</legend>
          <div className="row" style={{ flexWrap: "wrap", gap: "6px 18px" }}>
            <label className="check">
              <input
                type="checkbox"
                checked={form.utilities_included.includes("none")}
                onChange={(e) => setField("utilities_included", e.target.checked ? ["none"] : [])}
              />
              None included (plus utilities)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={["Heat", "Hydro", "Water"].every((u) => form.utilities_included.includes(u))}
                onChange={(e) =>
                  setField("utilities_included", (cur) =>
                    e.target.checked
                      ? [...new Set([...cur.filter((u) => u !== "none"), "Heat", "Hydro", "Water"])]
                      : cur.filter((u) => !["Heat", "Hydro", "Water"].includes(u))
                  )
                }
              />
              All inclusive
            </label>
            {UTILITIES.map((u) => (
              <label key={u} className="check">
                <input
                  type="checkbox"
                  checked={form.utilities_included.includes(u)}
                  onChange={(e) =>
                    setField("utilities_included", (cur) =>
                      e.target.checked ? [...cur.filter((x) => x !== "none"), u] : cur.filter((x) => x !== u)
                    )
                  }
                />
                {u}
              </label>
            ))}
          </div>
          <span className="small">
            {form.utilities_included.length ? `Shown as: ${utilitiesText(form.utilities_included)}` : form.utilities ? `Currently shown as: ${form.utilities}` : "Tick what the rent covers."}
          </span>
        </fieldset>
        <div className="row3">
          <div className="field">
            <label htmlFor="f-parking">Parking</label>
            <select id="f-parking" value={form.parking_option} onChange={update("parking_option")}>
              <option value="">Not set</option>
              {Object.entries(PARKING_OPTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {["included", "assigned"].includes(form.parking_option) ? (
            <div className="field">
              <label htmlFor="f-spots">How many spots</label>
              <input id="f-spots" type="number" inputMode="numeric" min="0" max="50" step="1" value={form.parking_spots} onChange={update("parking_spots")} />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="f-laundry">Laundry</label>
            <select id="f-laundry" value={form.laundry_option} onChange={update("laundry_option")}>
              <option value="">Not set</option>
              {Object.entries(LAUNDRY_OPTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        {["included", "assigned"].includes(form.parking_option) ? (
          <div className="field">
            <label htmlFor="f-park-notes">Parking instructions (for the tenant; not shown on the listing)</label>
            <textarea id="f-park-notes" rows={2} value={form.parking_instructions} onChange={update("parking_instructions")} placeholder="e.g. Left side of the driveway, spot 2. No parking on the lawn." />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="f-description">Description</label>
          <textarea id="f-description" rows={6} value={form.description} onChange={update("description")} />
        </div>
      </section>

      <section className="boxed stack" aria-labelledby="sec-features">
        <h2 id="sec-features" className="sec-title">
          Features
        </h2>
        <FeaturesEditor features={form.features} onChange={(next) => setField("features", next)} />
      </section>

      <section className="boxed stack" aria-labelledby="sec-photos">
        <h2 id="sec-photos" className="sec-title">
          Photos
        </h2>
        <PhotoManager
          folder={folder}
          photos={form.photos}
          onChange={(next) => setField("photos", next)}
          onUploaded={(url) => sessionUploads.current.add(url)}
          onBusyChange={setUploading}
        />
      </section>

      <div className="save-bar" role="region" aria-label="Save listing">
        <div aria-live="polite" className="save-msg">
          {error ? <div className="warnbox">{error}</div> : msg ? <div className="okbox">{msg}</div> : null}
        </div>
        <div className="row save-actions">
          <button type="button" className="btn ghost" disabled={busy || uploading} onClick={() => save("draft")}>
            {saving === "draft" ? "Saving…" : "Save as draft"}
          </button>
          {!isNew ? (
            <button type="button" className="btn ghost" disabled={busy || uploading} onClick={() => save("leased")}>
              {saving === "leased" ? "Saving…" : "Mark as leased"}
            </button>
          ) : null}
          <button type="button" className="btn primary" disabled={busy || uploading} onClick={() => save("available")}>
            {saving === "available" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </form>
  );
}
