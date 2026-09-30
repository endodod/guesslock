"use client";
import { useMemo, useState, useTransition } from "react";
import { approveRedactedLine, runVoiceImportHero, setGenericVoice, updateVoiceLine } from "../../actions";

type Line = {
  id: number; text: string; source: string; words: number; status: string; starred: boolean;
  section: string; reason: string | null; audio: boolean; changed: boolean; edited: boolean;
};

const STATUSES = ["approved", "needs_redaction", "needs_review", "excluded"];

export function VoiceLineManager({
  heroId, heroName, importedAt, revisionId, generic, genericManual, lines: initial,
}: {
  heroId: number; heroName: string; importedAt: string | null; revisionId: number | null;
  generic: boolean; genericManual: boolean; lines: Line[];
}) {
  const [lines, setLines] = useState(initial);
  const [filter, setFilter] = useState("usable");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === "usable" && l.status === "excluded") return false;
      if (filter !== "usable" && filter !== "all" && l.status !== filter && !(filter === "changed" && l.changed)) return false;
      return !needle || l.text.toLowerCase().includes(needle);
    });
  }, [lines, filter, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lines) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [lines]);

  const patch = (id: number, p: Partial<Pick<Line, "status" | "starred" | "text">>) => {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p, edited: true, changed: false } : l)));
    start(async () => { await updateVoiceLine(id, p); });
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span>Last import: {importedAt ? new Date(importedAt).toLocaleString() : "never"}{revisionId ? ` (wiki rev ${revisionId})` : ""}</span>
        <button
          type="button"
          disabled={pending}
          className="rounded border border-neutral-400 px-3 py-1 disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await runVoiceImportHero(heroId);
            setMsg(r.status === "ok" ? `Imported ${r.lines} lines, ${r.approved} approved, ${r.changed} changed.` : `${r.status}: ${r.note}`);
            window.location.reload();
          })}
        >
          {pending ? "Working…" : `Import ${heroName}'s voice lines`}
        </button>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" defaultChecked={generic} onChange={(e) => start(async () => { await setGenericVoice(heroId, e.target.checked); })} />
          Uses generic placeholder voice lines {genericManual ? "(set manually)" : "(auto-detected)"}
        </label>
        {msg && <span className="text-neutral-600">{msg}</span>}
      </div>
      <p className="text-xs text-neutral-500">
        Text-only for now (no audio). Lines under 6 words are excluded; lines naming the hero or their abilities are redacted and need approval.
        Re-importing never overwrites manual edits; changed wiki lines are flagged. Starred lines are revealed last.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-neutral-400 px-2 py-1">
          <option value="usable">Not excluded</option>
          <option value="all">All ({lines.length})</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>)}
          <option value="changed">Changed on wiki</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text" className="rounded border border-neutral-400 px-2 py-1" />
        <span className="text-neutral-500">{shown.length} shown · {counts.approved ?? 0} approved</span>
      </div>
      <div className="max-h-[36rem] overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white text-left text-neutral-500">
            <tr><th>★</th><th>Text</th><th>Words</th><th>Audio</th><th>Status</th><th>Section</th></tr>
          </thead>
          <tbody>
            {shown.slice(0, 400).map((l) => (
              <tr key={l.id} className={`border-t border-neutral-200 align-top ${l.changed ? "bg-amber-50" : ""}`}>
                <td>
                  <button type="button" aria-label="Star as iconic" onClick={() => patch(l.id, { starred: !l.starred })} className={l.starred ? "text-amber-500" : "text-neutral-300"}>★</button>
                </td>
                <td className="w-1/2">
                  <textarea
                    defaultValue={l.text}
                    rows={Math.min(4, Math.ceil(l.text.length / 70))}
                    onBlur={(e) => e.target.value !== l.text && patch(l.id, { text: e.target.value })}
                    className="w-full rounded border border-neutral-200 px-1"
                  />
                  {l.text !== l.source && <div className="text-xs text-neutral-500">Source: {l.source}</div>}
                  {l.reason && <div className="text-xs text-amber-700">{l.reason}</div>}
                </td>
                <td>{l.words}</td>
                <td>{l.audio ? "yes" : "no"}</td>
                <td>
                  <select value={l.status} onChange={(e) => patch(l.id, { status: e.target.value })} className="rounded border border-neutral-300 px-1">
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  {l.status === "needs_redaction" && (
                    <button type="button" className="ml-1 text-xs text-blue-700" onClick={() => start(async () => { await approveRedactedLine(l.id); setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, status: "approved" } : x))); })}>
                      Redact + approve
                    </button>
                  )}
                </td>
                <td className="text-xs text-neutral-500">{l.section}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 400 && <p className="p-2 text-xs text-neutral-500">Showing 400 of {shown.length}; narrow with the filter or search.</p>}
      </div>
    </div>
  );
}
