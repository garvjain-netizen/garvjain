"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  contactId: string;
  kind: "birthday" | "renewal";
  renewalId?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
}

type Outcome = { kind: "ok" | "err"; text: string } | null;

/** One click: queue the message, send it, report what happened. */
export function SendButton({ contactId, kind, renewalId, disabled, disabledReason }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function send() {
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, kind, renewalId: renewalId ?? undefined }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setOutcome({ kind: "err", text: data.error ?? `Failed (HTTP ${response.status})` });
      } else if (data.error) {
        setOutcome({ kind: "err", text: data.error });
      } else {
        setOutcome({ kind: "ok", text: data.status === "sent" ? "Sent" : `Queued (${data.status})` });
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setOutcome({ kind: "err", text: error instanceof Error ? error.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <span className="badge badge-warn" title={disabledReason ?? undefined}>
        {disabledReason ?? "Unavailable"}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      {outcome && (
        <span className={`badge ${outcome.kind === "ok" ? "badge-ok" : "badge-danger"}`}>
          {outcome.text}
        </span>
      )}
      <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || pending}>
        {busy ? "Sending…" : "Send"}
      </button>
    </span>
  );
}
