"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  problems?: Array<{ row: number; name: string; reason?: string }>;
}

const SAMPLE = `name,phone,date_of_birth,opt_in,renewal_label,renewal_date,renewal_amount
Ananya Sharma,9876543210,1995-04-12,yes,,,
Rahul Mehta,+919876543211,12/08/1990,yes,Car Insurance,2026-11-30,12500`;

export function CsvImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const csv = await file.text();
      const response = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) setError(data.error ?? `Failed (HTTP ${response.status})`);
      else {
        setResult(data);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Import CSV
      </button>
    );
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Import contacts from CSV</div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Recognised columns: <code>name</code>, <code>phone</code>, <code>email</code>,{" "}
        <code>date_of_birth</code>, <code>opt_in</code>, <code>opt_in_source</code>,{" "}
        <code>notes</code>, <code>renewal_label</code>, <code>renewal_date</code>,{" "}
        <code>renewal_amount</code>. Dates accept <code>YYYY-MM-DD</code> or{" "}
        <code>DD/MM/YYYY</code>. Existing contacts are matched on phone number and updated.
      </p>

      <details style={{ marginBottom: 12 }}>
        <summary className="small muted" style={{ cursor: "pointer" }}>Example file</summary>
        <pre className="preview mono" style={{ overflowX: "auto" }}>{SAMPLE}</pre>
      </details>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {busy && <div className="small muted" style={{ marginTop: 10 }}>Importing…</div>}
      {error && <div className="flash flash-err" style={{ marginTop: 10 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 12 }}>
          <div className={`flash ${result.failed > 0 ? "flash-err" : "flash-ok"}`}>
            {result.total} row(s): {result.created} added, {result.updated} updated,{" "}
            {result.failed} failed
          </div>
          {result.problems && result.problems.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Row</th><th>Name</th><th>Problem</th></tr>
                </thead>
                <tbody>
                  {result.problems.map((p) => (
                    <tr key={p.row}>
                      <td className="mono">{p.row}</td>
                      <td>{p.name}</td>
                      <td className="small">{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="form-actions">
        <button className="btn" onClick={() => { setOpen(false); setResult(null); setError(null); }}>
          Close
        </button>
      </div>
    </div>
  );
}
