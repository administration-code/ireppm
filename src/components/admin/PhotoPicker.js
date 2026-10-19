"use client";

import { MAX_PHOTO_MB, PHOTO_ACCEPT, PHOTO_BUCKET, randomId, safeFileName } from "@/lib/maintenance";

export const STAFF_MAX_PHOTOS = 15;

// Uploads the picked files to the maintenance photo bucket. Returns { photos } or { error }.
export async function uploadPhotos(sb, userId, files) {
  const photos = [];
  for (const file of files) {
    const path = `${userId}/${randomId()}/${safeFileName(file.name)}`;
    const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) {
      if (photos.length) await sb.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.path));
      return { error: `We couldn't upload ${file.name}. Check the file and your connection, then try again.` };
    }
    photos.push({ path, name: file.name });
  }
  return { photos };
}

export default function PhotoPicker({ files, setFiles, onError, max = STAFF_MAX_PHOTOS, id = "photo-files", label = "Photos or videos" }) {
  function addFiles(list) {
    onError?.("");
    const picked = Array.from(list || []);
    const tooBig = picked.find((file) => file.size > MAX_PHOTO_MB * 1024 * 1024);
    if (tooBig) return onError?.(`${tooBig.name} is over ${MAX_PHOTO_MB} MB.`);
    const next = [...files, ...picked];
    if (next.length > max) onError?.(`You can add up to ${max} photos or videos at a time.`);
    setFiles(next.slice(0, max));
  }

  return (
    <div className="field">
      <span className="label-text">
        {label} <span className="small">(optional, up to {max})</span>
      </span>
      {files.length ? (
        <ul className="plain-list">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="file-row">
              <span>{file.name}</span>
              <button type="button" className="btn ghost sm" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                Remove<span className="visually-hidden"> {file.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {files.length < max ? (
        <div>
          <label className="btn ghost sm" htmlFor={id}>
            Add photos or videos
          </label>
          <input
            id={id}
            className="visually-hidden"
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      ) : null}
      <span className="small">Save photos from the tenant&apos;s email to your computer first, then add them here.</span>
    </div>
  );
}
