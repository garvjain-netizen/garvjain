"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const EMPTY = {
  name: "",
  language: "en",
  category: "UTILITY" as "MARKETING" | "UTILITY" | "AUTHENTICATION",
  kind: "custom" as "birthday" | "renewal" | "custom",
  body: "",
  status: "PENDING" as "PENDING" | "APPROVED" | "REJECTED" | "PAUSED",
};

export function TemplateForm({ availableVariables }: { availableVariables: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [variables, setVariables] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  // {{1}}, {{2}}, ... — the count must match the mapped variables or Meta
  // rejects the send with error 132000.
  const placeholderCount = useMemo(() => {
    const found = [...form.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    return found.length === 0 ? 0 : Math.max(...found);
  }, [form.body]);

  const mismatch = placeholderCount !== variables.length;

  function setVariable(index: number, value: string) {
    setVariables((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          variables: Array.from({ length: placeholderCount }, (_, i) => variables[i] ?? ""),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setFlash({ ok: false, text: data.error ?? `Failed (HTTP ${response.status})` });
      } else {
        setFlash({ ok: true, text: `Saved ${data.template.name}` });
        setForm(EMPTY);
        setVariables([]);
        router.refresh();
      }
    } catch (error) {
      setFlash({ ok: false, text: error instanceof Error ? error.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button className="btn" onClick={() => setOpen(true)}>+ Add template</button>;
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      {flash && <div className={`flash ${flash.ok ? "flash-ok" : "flash-err"}`}>{flash.text}</div>}

      <p className="small muted" style={{ marginTop: 0 }}>
        This mirrors a template you created in WhatsApp Manager — it does not create one at Meta.
        The <strong>name</strong>, <strong>language</strong> and placeholder count must match the
        approved template exactly, or the send fails.
      </p>

      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="t-name">Template name *</label>
            <input
              id="t-name"
              required
              placeholder="renewal_reminder_v1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
            />
          </div>
          <div className="field">
            <label htmlFor="t-lang">Language</label>
            <input
              id="t-lang"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="t-cat">Category</label>
            <select
              id="t-cat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}
            >
              <option value="UTILITY">Utility (cheaper — reminders, updates)</option>
              <option value="MARKETING">Marketing (wishes, offers)</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-kind">Used for</label>
            <select
              id="t-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}
            >
              <option value="custom">Manual sends only</option>
              <option value="birthday">Birthday wishes</option>
              <option value="renewal">Renewal reminders</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-status">Approval status at Meta</label>
            <select
              id="t-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
            >
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAUSED">Paused</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="t-body">Body — use {"{{1}}"}, {"{{2}}"} for variables *</label>
          <textarea
            id="t-body"
            required
            placeholder="Hi {{1}}, your {{2}} is due for renewal on {{3}}."
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </div>

        {placeholderCount > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>
              Map each placeholder to a value:
            </div>
            <div className="form-grid">
              {Array.from({ length: placeholderCount }, (_, index) => (
                <div className="field" key={index}>
                  <label htmlFor={`t-var-${index}`}>{`{{${index + 1}}}`}</label>
                  <select
                    id={`t-var-${index}`}
                    value={variables[index] ?? ""}
                    onChange={(e) => setVariable(index, e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {availableVariables.map((variable) => (
                      <option key={variable} value={variable}>{variable}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {mismatch && (
          <div className="flash flash-err" style={{ marginTop: 12 }}>
            {placeholderCount} placeholder(s) in the body, {variables.filter(Boolean).length} mapped.
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save template"}
          </button>
          <button className="btn" type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
      </form>
    </div>
  );
}
