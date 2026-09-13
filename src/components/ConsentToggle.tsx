"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Records or withdraws consent. Withdrawing also cancels queued messages. */
export function ConsentToggle({ contactId, optedIn }: { contactId: string; optedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (optedIn && !window.confirm("Opt this contact out? Anything queued for them is cancelled.")) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/contacts/${contactId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: !optedIn, source: "dashboard" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`btn btn-sm ${optedIn ? "btn-danger" : ""}`}
      onClick={toggle}
      disabled={busy}
    >
      {busy ? "…" : optedIn ? "Opt out" : "Opt in"}
    </button>
  );
}
