"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { MAX_PHOTO_MB, PHOTO_ACCEPT, PHOTO_BUCKET, PHOTO_TYPES } from "@/lib/admin-listings";

export default function PhotoManager({ folder, photos, onChange, onUploaded, onBusyChange }) {
  const [progress, setProgress] = useState("");
  const [problems, setProblems] = useState([]);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  async function upload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const sb = getBrowserClient();
    const skipped = [];
    onBusyChange(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!PHOTO_TYPES.includes(file.type)) {
        skipped.push(`${file.name}: use a JPG, PNG or WebP image.`);
        continue;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        skipped.push(`${file.name}: over ${MAX_PHOTO_MB} MB.`);
        continue;
      }
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${folder}/${Date.now()}-${i}-${safe}`;
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) {
        skipped.push(`${file.name}: upload failed. Try again.`);
        continue;
      }
      const url = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
      onUploaded(url);
      onChange((current) => [...current, url]);
    }

    setProgress("");
    setProblems(skipped);
    onBusyChange(false);
  }

  const makeCover = (i) => onChange((current) => [current[i], ...current.filter((_, j) => j !== i)]);
  const remove = (i) => onChange((current) => current.filter((_, j) => j !== i));
  // Move the photo at `from` so it sits at position `to`.
  const moveTo = (from, to) =>
    onChange((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <label className="btn ghost" htmlFor="f-photos" aria-disabled={Boolean(progress)}>
          {progress || "Add photos"}
        </label>
        <input
          className="visually-hidden"
          id="f-photos"
          type="file"
          accept={PHOTO_ACCEPT}
          multiple
          disabled={Boolean(progress)}
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="small">
          JPG, PNG or WebP, up to {MAX_PHOTO_MB} MB each. Drag photos to reorder them (or use the arrows). The first photo is the cover.
        </span>
      </div>

      {problems.length ? (
        <div className="warnbox" role="alert">
          <p>Some photos weren&apos;t added:</p>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {photos.length ? (
        <ul className="photo-grid" aria-label="Listing photos">
          {photos.map((url, i) => (
            <li
              className={`photo-tile${dragFrom === i ? " is-dragging" : ""}${dragOver === i && dragFrom !== i ? " is-over" : ""}`}
              key={url}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== i) setDragOver(i);
              }}
              onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragFrom ?? Number(e.dataTransfer.getData("text/plain"));
                moveTo(from, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
            >
              <div className="img">
                <img src={url} alt={`Photo ${i + 1}`} loading="lazy" />
                {i === 0 ? <span className="tag">Cover</span> : null}
              </div>
              <div className="acts">
                <button type="button" className="btn ghost sm" onClick={() => moveTo(i, i - 1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}>
                  ←
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => moveTo(i, i + 1)}
                  disabled={i === photos.length - 1}
                  aria-label={`Move photo ${i + 1} later`}
                >
                  →
                </button>
                {i > 0 ? (
                  <button type="button" className="btn ghost sm" onClick={() => makeCover(i)}>
                    Make cover
                  </button>
                ) : null}
                <button type="button" className="btn ghost sm" onClick={() => remove(i)}>
                  Remove<span className="visually-hidden"> photo {i + 1}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty" style={{ padding: 28 }}>
          No photos yet. Listings with photos get far more showing requests.
        </div>
      )}
    </div>
  );
}
