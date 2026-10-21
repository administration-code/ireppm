import { videoEmbed } from "@/lib/video-embed";

// Video walkthroughs on the public listing page.
export default function ListingVideos({ videos }) {
  const list = (Array.isArray(videos) ? videos : []).filter((v) => v?.url);
  if (!list.length) return null;
  return (
    <section className="stack" style={{ gap: 12 }} aria-labelledby="listing-videos">
      <h3 id="listing-videos">{list.length === 1 ? "Video Walkthrough" : "Video Walkthroughs"}</h3>
      <ul className="video-list public">
        {list.map((v, i) => {
          const e = videoEmbed(v.url);
          return (
            <li key={`${v.url}-${i}`} className="stack" style={{ gap: 6 }}>
              {e.kind === "link" ? (
                <a className="btn ghost" href={v.url} target="_blank" rel="noopener noreferrer">
                  Watch: {v.title || "video walkthrough"}
                </a>
              ) : (
                <>
                  <div className="video-frame">
                    {e.kind === "iframe" ? (
                      <iframe src={e.src} title={v.title || "Video walkthrough"} loading="lazy" allow="fullscreen; picture-in-picture" allowFullScreen />
                    ) : (
                      <video src={e.src} controls preload="metadata" playsInline />
                    )}
                  </div>
                  {v.title ? <span className="small">{v.title}</span> : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
