// Turns a walkthrough link into something we can show: an embeddable player for YouTube, Vimeo
// and Google Drive, or a plain link for anything else.
export function videoEmbed(url) {
  const u = String(url || "").trim();
  let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/i.exec(u);
  if (m) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${m[1]}`, host: "YouTube" };
  m = /vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/i.exec(u);
  if (m) return { kind: "iframe", src: `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ""}`, host: "Vimeo" };
  m = /drive\.google\.com\/file\/d\/([\w-]+)/i.exec(u);
  if (m) return { kind: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview`, host: "Google Drive" };
  if (/\.(mp4|mov|webm)(\?|$)/i.test(u) || /\/storage\/v1\/object\/public\/listing-videos\//.test(u)) return { kind: "file", src: u };
  return { kind: "link", src: u };
}

export const isHttpUrl = (u) => /^https?:\/\/\S+\.\S+/i.test(String(u || "").trim());
