"use client";

import { useState } from "react";
import { PhotoPlaceholder } from "./Brand";

export default function ListingGallery({ photos, title, tag }) {
  const list = (photos || []).filter(Boolean);
  const [i, setI] = useState(0);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="photo">
        {list.length ? <img src={list[i]} alt={`${title}, photo ${i + 1} of ${list.length}`} /> : <PhotoPlaceholder label="Photos coming soon" />}
        {tag ? <span className="tag">{tag}</span> : null}
      </div>
      {list.length > 1 ? (
        <div className="thumbs">
          {list.map((src, n) => (
            <button key={src} aria-pressed={n === i} aria-label={`Show photo ${n + 1}`} onClick={() => setI(n)}>
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
