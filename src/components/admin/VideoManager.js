"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { MAX_VIDEO_MB, VIDEO_ACCEPT, VIDEO_BUCKET, VIDEO_TYPES } from "@/lib/admin-listings";
import { isHttpUrl, videoEmbed } from "@/lib/video-embed";

// Video walkthroughs for a listing: upload a short clip, or paste a YouTube / Vimeo / Google Drive link.
export default function VideoManager({ folder, videos, onChange, onUploaded, onBusyChange }) {
  const [progress, setProgress] = useState("");
  const [problem, setProblem] = useState("");
  const [link, setLink] = useState({ url: "", title: "" });

  async function upload(fileList) {
    const file = Array.from(fileList || [])[0];
    if (!file) return;
    setProblem("");
    if (!VIDEO_TYPES.includes(file.type)) return setProblem(`${file.name}: use an MP4, MOV or WebM video.`);
    if (file.size > MAX_VIDEO_MB * 1024 * 1024)
      return setProblem(
        `${file.name} is over ${MAX_VIDEO_MB} MB. Upload it to YouTube (as Unlisted) or Google Drive and paste the link below instead.`
      );
    onBusyChange(true);
    setProgress(`Uploading ${file.name}…`);
    const sb = getBrowserClient();
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${folder}/${Date.now()}-${safe}`;
    const { error } = await sb.storage.from(VIDEO_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    setProgress("");
    onBusyChange(false);
    if (error) return setProblem(`${file.name}: the upload failed. Try again, or paste a link instead.`);
    const url = sb.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
    onUploaded(url);
    onChange((current) => [...current, { kind: "upload", url, title: file.name.replace(/\.[^.]+$/, "") }]);
  }

  function addLink() {
    setProblem("");
    if (!isHttpUrl(link.url)) return setProblem("Paste the full link, starting with https://");
    onChange((current) => [...current, { kind: "link", url: link.url.trim(), title: link.title.trim() || "Video walkthrough" }]);
    setLink({ url: "", title: "" });
  }

  const rename = (i, title) => onChange((current) => current.map((v, j) => (j === i ? { ...v, title } : v)));
  const remove = (i) => onChange((current) => current.filter((_, j) => j !== i));
  const move = (i, d) =>
    onChange((current) => {
      const next = [...current];
      const j = i + d;
      if (j < 0 || j >= next.length) return current;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <label className="btn ghost" htmlFor="f-videos" aria-disabled={Boolean(progress)}>
          {progress || "Upload a video"}
        </label>
        <input
          className="visually-hidden"
          id="f-videos"
          type="file"
          accept={VIDEO_ACCEPT}
          disabled={Boolean(progress)}
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="small">MP4, MOV or WebM, up to {MAX_VIDEO_MB} MB. For longer walkthroughs, paste a link.</span>
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="f-vlink">Or paste a link (YouTube, Vimeo, Google Drive)</label>
          <input
            id="f-vlink"
            type="url"
            value={link.url}
            placeholder="https://youtu.be/…"
            onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="f-vtitle">Title (optional)</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input id="f-vtitle" value={link.title} placeholder="Full walkthrough" onChange={(e) => setLink((l) => ({ ...l, title: e.target.value }))} />
            <button type="button" className="btn ghost" onClick={addLink}>
              Add link
            </button>
          </div>
        </div>
      </div>
      <p className="small">
        Tip: on YouTube choose <b>Unlisted</b> so only people with the link can see it. On Google Drive set sharing to
        &ldquo;Anyone with the link&rdquo;.
      </p>

      {problem ? (
        <div className="warnbox" role="alert">
          {problem}
        </div>
      ) : null}

      {videos.length ? (
        <ul className="video-list">
          {videos.map((v, i) => {
            const e = videoEmbed(v.url);
            return (
              <li key={`${v.url}-${i}`} className="video-item">
                <div className="video-frame">
                  {e.kind === "iframe" ? (
                    <iframe src={e.src} title={v.title || "Video walkthrough"} loading="lazy" allow="fullscreen; picture-in-picture" allowFullScreen />
                  ) : e.kind === "file" ? (
                    <video src={e.src} controls preload="metadata" />
                  ) : (
                    <a href={v.url} target="_blank" rel="noreferrer" className="video-link">
                      Open video link
                    </a>
                  )}
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  <div className="field">
                    <label htmlFor={`vt-${i}`}>Title</label>
                    <input id={`vt-${i}`} value={v.title || ""} onChange={(ev) => rename(i, ev.target.value)} />
                  </div>
                  <span className="small">
                    {v.kind === "upload" ? "Uploaded video" : e.host ? `${e.host} link` : "Link"}
                  </span>
                  <div className="req-actions">
                    <button type="button" className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0}>
                      Move up
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === videos.length - 1}>
                      Move down
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => remove(i)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small">No videos yet. They show on the public listing page, under the photos.</p>
      )}
    </div>
  );
}
