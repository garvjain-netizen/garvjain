"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Queues and sends everything due today, in one go. */
export function SendAllButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(`Send all ${count} pending message(s) now?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/send/all", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setResult(data.error ?? `Failed (HTTP ${response.status})`);
      } else {
        const { queued } = data.scan;
        const { sent, failed } = data.drained;
        setResult(`Queued ${queued}, sent ${sent}${failed > 0 ? `, ${failed} failed` : ""}`);
      }
      router.refresh();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn btn-primary" onClick={run} disabled={busy || count === 0}>
        {busy ? "Sending…" : `Send all ${count > 0 ? `(${count})` : ""}`}
      </button>
      {result && <span className="small muted">{result}</span>}
    </span>
  );
}
