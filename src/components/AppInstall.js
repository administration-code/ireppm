"use client";

import { useEffect, useState } from "react";

// Registers the service worker on every page, so the site can be installed as an app.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || location.hostname === "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

// "Install the app" button on Android/Chrome/Edge; instructions on iPhone and iPad.
export default function AppInstall() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState("");

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setPlatform(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : "desktop");
    setInstalled(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <div className="okbox">The IRep app is installed on this device. Open it from your home screen.</div>;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {prompt ? (
        <button
          type="button"
          className="btn primary"
          style={{ justifySelf: "start" }}
          onClick={async () => {
            prompt.prompt();
            const r = await prompt.userChoice.catch(() => null);
            if (r?.outcome === "accepted") setInstalled(true);
            setPrompt(null);
          }}
        >
          Install the IRep App
        </button>
      ) : null}
      <div className="app-steps">
        <section className={`boxed stack${platform === "ios" ? " is-mine" : ""}`} style={{ gap: 8 }}>
          <h2 className="sub-title">iPhone and iPad</h2>
          <ol>
            <li>Open ireppm.ca in Safari.</li>
            <li>Tap the Share button (the square with an arrow).</li>
            <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          </ol>
        </section>
        <section className={`boxed stack${platform === "android" ? " is-mine" : ""}`} style={{ gap: 8 }}>
          <h2 className="sub-title">Android</h2>
          <ol>
            <li>Open ireppm.ca in Chrome.</li>
            <li>Tap the menu (three dots) at the top right.</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
          </ol>
        </section>
        <section className={`boxed stack${platform === "desktop" ? " is-mine" : ""}`} style={{ gap: 8 }}>
          <h2 className="sub-title">Computer</h2>
          <ol>
            <li>Open ireppm.ca in Chrome or Edge.</li>
            <li>Click the install icon at the right end of the address bar.</li>
            <li>Click <b>Install</b>.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
