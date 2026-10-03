"use client";
// The /feedback form: report a bug in one puzzle (day + lock), or a wrong value of a hero, item or ability
// (the field, what is shown, and optionally the right value).
import { useMemo, useState } from "react";
import { Button, DecoFrame } from "./ui";

export type FeedbackLock = { slug: string; label: string };
export type FeedbackEntity = {
  entity: "hero" | "item" | "ability"; id: number; name: string;
  fields: { key: string; label: string }[];
  values: Record<string, string>;
};
type Kind = "bug" | "data";
type Initial = { kind: Kind; date?: string; lock?: string; entity?: string; id?: number; field?: string };

const ENTITY_LABEL = { hero: "Hero", item: "Item", ability: "Ability" } as const;
const OTHER = "other";

const field = "mt-1 block w-full rounded-[3px] border border-brass/40 bg-ink px-3 py-2 text-paper placeholder:text-ash/70 focus:border-brass focus:outline-none";
const label = "block text-sm text-paper/90";

export function FeedbackForm({ locks, entities, today, initial }: { locks: FeedbackLock[]; entities: FeedbackEntity[]; today: string; initial: Initial }) {
  const [kind, setKind] = useState<Kind>(initial.kind);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Bug report
  const [date, setDate] = useState(initial.date && initial.date <= today ? initial.date : today);
  const [lock, setLock] = useState(locks.some((l) => l.slug === initial.lock) ? initial.lock! : "");
  const [bugText, setBugText] = useState("");

  // Data report
  const start = entities.find((e) => e.entity === initial.entity && e.id === initial.id);
  const [entity, setEntity] = useState<FeedbackEntity["entity"]>(start?.entity ?? "hero");
  const [id, setId] = useState<number | "">(start?.id ?? "");
  const [fieldKey, setFieldKey] = useState(start?.fields.some((f) => f.key === initial.field) ? initial.field! : "");
  const [otherField, setOtherField] = useState("");
  const [shown, setShown] = useState("");
  const [suggested, setSuggested] = useState("");
  const [dataText, setDataText] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const options = useMemo(() => entities.filter((e) => e.entity === entity).sort((a, b) => a.name.localeCompare(b.name)), [entities, entity]);
  const picked = options.find((e) => e.id === id);
  const current = picked && fieldKey && fieldKey !== OTHER ? picked.values[fieldKey] ?? "" : null;

  const reset = () => {
    setStatus("idle"); setError(null); setBugText(""); setSuggested(""); setDataText(""); setShown(""); setOtherField("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const page = typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined;
    let body: Record<string, unknown>;
    if (kind === "bug") {
      if (!lock) return setError("Pick the puzzle.");
      if (bugText.trim().length < 5) return setError("Describe what went wrong.");
      body = { kind, date: date || null, lock, description: bugText, page, website };
    } else {
      if (!picked) return setError(`Pick the ${ENTITY_LABEL[entity].toLowerCase()}.`);
      if (!fieldKey || (fieldKey === OTHER && !otherField.trim())) return setError("Say which value is wrong.");
      if (!suggested.trim() && !dataText.trim()) return setError("Give the right value or describe what's wrong.");
      const f = picked.fields.find((x) => x.key === fieldKey);
      body = {
        kind, entity, entityId: picked.id,
        field: fieldKey, fieldLabel: fieldKey === OTHER ? otherField : f?.label ?? fieldKey,
        currentValue: (current ?? shown).slice(0, 300), suggested, description: dataText, page, website,
      };
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 429) throw new Error("Too many reports for now. Try again later.");
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "The report didn't go through. Try again.");
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError((err as Error).message);
    }
  };

  if (status === "sent") {
    return (
      <DecoFrame className="space-y-3 p-6 text-center">
        <p className="font-display text-2xl text-ecto">Thank you.</p>
        <p className="text-paper/90">Your report is in. We&apos;ll look at it and fix what&apos;s wrong.</p>
        <Button variant="ghost" onClick={reset}>Report something else</Button>
      </DecoFrame>
    );
  }

  return (
    <DecoFrame className="p-5 md:p-6">
      <div role="tablist" aria-label="What's wrong" className="mb-5 grid grid-cols-2 gap-1">
        {([["bug", "A puzzle is broken"], ["data", "A value is wrong"]] as const).map(([k, l]) => (
          <button
            key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setError(null); }}
            className={`min-h-11 rounded-[3px] border px-3 text-sm ${kind === k ? "border-brass bg-brass/15 text-paper" : "border-brass/25 text-ash hover:text-paper"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        {/* Honeypot: hidden from people, filled in by bots. */}
        <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

        {kind === "bug" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <label className={label}>Day
                <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
              <label className={label}>Puzzle
                <select value={lock} onChange={(e) => setLock(e.target.value)} className={field} required>
                  <option value="">Choose the lock…</option>
                  {locks.map((l) => <option key={l.slug} value={l.slug}>{l.label}</option>)}
                </select>
              </label>
            </div>
            <label className={label}>What went wrong?
              <textarea value={bugText} onChange={(e) => setBugText(e.target.value)} rows={5} maxLength={2000} placeholder="What you did, what you expected, and what happened instead." className={field} required />
            </label>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <label className={label}>Type
                <select value={entity} onChange={(e) => { setEntity(e.target.value as FeedbackEntity["entity"]); setId(""); setFieldKey(""); }} className={field}>
                  {(Object.keys(ENTITY_LABEL) as FeedbackEntity["entity"][]).map((k) => <option key={k} value={k}>{ENTITY_LABEL[k]}</option>)}
                </select>
              </label>
              <label className={label}>{ENTITY_LABEL[entity]}
                <select value={id} onChange={(e) => { setId(e.target.value ? Number(e.target.value) : ""); setFieldKey(""); }} className={field}>
                  <option value="">Choose…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
            </div>
            <label className={label}>Which value?
              <select value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} disabled={!picked} className={`${field} disabled:opacity-50`}>
                <option value="">Choose…</option>
                {picked?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                <option value={OTHER}>Something else</option>
              </select>
            </label>
            {fieldKey === OTHER && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={label}>What is it?
                  <input value={otherField} onChange={(e) => setOtherField(e.target.value)} maxLength={80} placeholder="e.g. a voice line, an icon" className={field} />
                </label>
                <label className={label}>What&apos;s shown now <span className="text-ash">(optional)</span>
                  <input value={shown} onChange={(e) => setShown(e.target.value)} maxLength={300} className={field} />
                </label>
              </div>
            )}
            {current !== null && (
              <div className="rounded-[3px] border border-brass/20 bg-ink/50 px-3 py-2 text-sm">
                <span className="text-ash">Shown now: </span><span className="text-paper">{current || "(nothing)"}</span>
              </div>
            )}
            <label className={label}>The right value <span className="text-ash">(optional)</span>
              <input value={suggested} onChange={(e) => setSuggested(e.target.value)} maxLength={300} placeholder="What it should be" className={field} />
            </label>
            <label className={label}>Details or source <span className="text-ash">(optional)</span>
              <textarea value={dataText} onChange={(e) => setDataText(e.target.value)} rows={3} maxLength={2000} placeholder="e.g. a link to the Deadlock Wiki" className={field} />
            </label>
          </>
        )}

        {error && <p role="alert" className="text-sm text-[#f0b3b0]">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ash">No account needed. If you&apos;re signed in, the report is linked to your account.</p>
          <Button type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send report"}</Button>
        </div>
      </form>
    </DecoFrame>
  );
}
