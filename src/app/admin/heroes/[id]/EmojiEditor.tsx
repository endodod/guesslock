"use client";
import { useState, useTransition } from "react";
import { saveEmojis } from "../../actions";

const GUIDE = [
  "10 emojis per hero. Each puzzle shows 5 of them (always one of the last 3), in this order.",
  "Order: hardest first, most obvious last.",
  "Mix appearance, abilities, personality and lore.",
  "No emoji that is basically the hero's name, especially not first.",
  "No two heroes may share the same first 3 emojis.",
];

// Emoji input: use the OS picker (Win + . / Ctrl+Cmd+Space) or paste into a slot.
export function EmojiEditor({
  heroId, initial, reviewed, others,
}: { heroId: number; initial: string[]; reviewed: boolean; others: { name: string; emojis: string[] }[] }) {
  const [slots, setSlots] = useState<string[]>(() => Array.from({ length: 10 }, (_, i) => initial[i] ?? ""));
  const [ok, setOk] = useState(reviewed);
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const key3 = (e: string[]) => [...e.slice(0, 3)].sort().join("|");
  const overlaps = slots.filter(Boolean).length >= 3 ? others.filter((o) => o.emojis.length >= 3 && key3(o.emojis) === key3(slots)) : [];
  const move = (from: number, to: number) => {
    if (to < 0 || to >= slots.length || from === to) return;
    const next = [...slots];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setSlots(next);
  };
  // Keep only the first grapheme per slot.
  const firstGrapheme = (s: string) => {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...seg.segment(s.trim())][0]?.segment ?? "";
  };

  return (
    <div className="space-y-3">
      <ul className="list-disc pl-5 text-xs text-neutral-600">{GUIDE.map((g) => <li key={g}>{g}</li>)}</ul>
      <ol className="flex flex-wrap gap-2">
        {slots.map((e, i) => (
          <li
            key={i}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
            className="flex flex-col items-center gap-1 rounded border border-neutral-300 bg-neutral-50 p-2"
          >
            <span className="text-xs text-neutral-500">{i + 1}{i === 0 ? " (hardest)" : i === 5 ? " (easiest)" : ""}</span>
            <input
              value={e}
              onChange={(ev) => setSlots(slots.map((s, j) => (j === i ? firstGrapheme(ev.target.value) : s)))}
              aria-label={`Emoji ${i + 1}`}
              className="h-12 w-14 rounded border border-neutral-400 text-center text-2xl"
            />
            <span className="flex gap-1">
              <button type="button" className="px-1 text-xs" onClick={() => move(i, i - 1)} aria-label="Move left">◀</button>
              <button type="button" className="px-1 text-xs" onClick={() => move(i, i + 1)} aria-label="Move right">▶</button>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm">Reveal preview: {slots.map((_, n) => <span key={n} className="mr-3">{slots.slice(0, n + 1).join("") || "—"}</span>)}</p>
      {overlaps.length > 0 && (
        <p className="text-sm text-red-700">Overlap: the first 3 emojis match {overlaps.map((o) => o.name).join(", ")}. Each set must be unique.</p>
      )}
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Reviewed (optional; any complete 10-emoji set is used; each puzzle shows 5 of them)
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || slots.some((s) => !s) && ok}
          onClick={() => start(async () => {
            await saveEmojis(heroId, slots, ok);
            setMsg("Saved");
          })}
          className="rounded bg-neutral-900 px-4 py-1.5 text-white disabled:opacity-50"
        >
          Save emoji set
        </button>
        {msg && <span className="text-xs text-neutral-600">{msg}</span>}
        {slots.some((s) => !s) && ok && <span className="text-xs text-red-700">All 10 slots are needed to mark it reviewed.</span>}
      </div>
    </div>
  );
}
