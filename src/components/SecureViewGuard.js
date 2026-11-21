"use client";

import { useEffect } from "react";

// Discourages saving on the secure document page: no right-click, drag, print or save shortcut.
export default function SecureViewGuard() {
  useEffect(() => {
    const stop = (e) => e.preventDefault();
    const keys = (e) => {
      if ((e.ctrlKey || e.metaKey) && ["s", "p"].includes(String(e.key).toLowerCase())) e.preventDefault();
    };
    document.addEventListener("contextmenu", stop);
    document.addEventListener("dragstart", stop);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("contextmenu", stop);
      document.removeEventListener("dragstart", stop);
      document.removeEventListener("keydown", keys);
    };
  }, []);
  return null;
}
