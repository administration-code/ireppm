"use client";

import { useEffect, useState } from "react";
import { KIND_TEMPLATES } from "@/lib/docusign-templates";
import { docusignApi } from "@/lib/signatures";

let pending = null;

function fetchStatus() {
  if (!pending) {
    pending = docusignApi("/status", { method: "GET" }).catch((err) => {
      pending = null;
      return { connected: false, reason: "error", message: err.message, templates: {} };
    });
  }
  return pending;
}

export function useDocusignStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let live = true;
    fetchStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

export function blockedReason(status, kind) {
  if (!status) return "Checking DocuSign…";
  if (!status.connected) {
    if (status.reason === "consent_required") return "DocuSign needs one-time consent. Open Signatures, then Check templates.";
    return "DocuSign isn't connected yet";
  }
  if ((KIND_TEMPLATES[kind] || []).some((k) => !status.templates[k])) return "Template not set up yet";
  return "";
}
