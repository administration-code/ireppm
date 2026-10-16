"use client";

import { useEffect, useState } from "react";
import { DELETED_EVENT } from "@/lib/delete-records";

const SHOW_MS = 3000;

export default function DeletedToast() {
  const [shownAt, setShownAt] = useState(0);

  useEffect(() => {
    const onDeleted = () => setShownAt(Date.now());
    window.addEventListener(DELETED_EVENT, onDeleted);
    return () => window.removeEventListener(DELETED_EVENT, onDeleted);
  }, []);

  useEffect(() => {
    if (!shownAt) return;
    const t = setTimeout(() => setShownAt(0), SHOW_MS);
    return () => clearTimeout(t);
  }, [shownAt]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {shownAt ? <div className="toast">Deleted.</div> : null}
    </div>
  );
}
