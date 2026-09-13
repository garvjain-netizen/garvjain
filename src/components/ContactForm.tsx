"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EMPTY = {
  name: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  language: "en",
  optIn: true,
  optInSource: "",
  notes: "",
};

export function ContactForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setFlash({ ok: false, text: data.error ?? `Failed (HTTP ${response.status})` });
      } else {
        setFlash({
          ok: true,
          text: `${data.created ? "Added" : "Updated"} ${data.contact.name} (${data.contact.phone_e164})`,
        });
        setForm(EMPTY);
        router.refresh();
      }
    } catch (error) {
      setFlash({ ok: false, text: error instanceof Error ? error.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Add contact
      </button>
    );
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      {flash && (
        <div className={`flash ${flash.ok ? "flash-ok" : "flash-err"}`}>{flash.text}</div>
      )}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="c-name">Name *</label>
            <input id="c-name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-phone">Phone *</label>
            <input
              id="c-phone"
              required
              placeholder="98765 43210 or +91…"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="c-dob">Date of birth</label>
            <input id="c-dob" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-email">Email</label>
            <input id="c-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-src">Opt-in source</label>
            <input
              id="c-src"
              placeholder="website form, signup, in-store…"
              value={form.optInSource}
              onChange={(e) => set("optInSource", e.target.value)}
            />
          </div>
        </div>

        <label className="checkbox" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={form.optIn} onChange={(e) => set("optIn", e.target.checked)} />
          <span>
            This person agreed to receive WhatsApp messages
            <span className="muted"> — required before anything can be sent to them</span>
          </span>
        </label>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save contact"}
          </button>
          <button className="btn" type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </form>
    </div>
  );
}
