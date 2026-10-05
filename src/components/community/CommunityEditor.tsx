"use client";
// The community puzzle editor: a sorting table (16 heroes, items or abilities in 4 named groups) or a Constellation
// (3 row and 3 column categories). The server runs the same checks again when the puzzle is published.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SeanceHero } from "@/lib/seance/types";
import { EXPLANATION_MAX, LABEL_MAX, TITLE_MAX, textProblem, type FacetOption } from "@/lib/community/rules";
import { normalize } from "@/lib/text/normalize";
import { Button, DecoFrame } from "../ui";

type Entity = "hero" | "item" | "ability";
type Group = { label: string; explanation: string; members: number[] };
const NOUN: Record<Entity, string> = { hero: "heroes", item: "items", ability: "abilities" };
const RANK = ["I · easiest", "II", "III", "IV · hardest"];
const BAND = ["seance-band-1", "seance-band-2", "seance-band-3", "seance-band-4"];
const MIN_PER_CELL = 2;

const emptyGroups = (): Group[] => Array.from({ length: 4 }, () => ({ label: "", explanation: "", members: [] }));

async function publish(puzzle: unknown): Promise<{ id?: string; error?: string }> {
  const res = await fetch("/api/community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", puzzle }) });
  const json = await res.json().catch(() => null);
  if (res.status === 429 && !json?.error) return { error: "Slow down a little: try again later." };
  return res.ok ? { id: json.id } : { error: json?.error ?? "Could not publish the puzzle." };
}

export function CommunityEditor({ entities, facets, heroes }: { entities: Record<Entity, SeanceHero[]>; facets: FacetOption[]; heroes: { id: number; name: string; image: string | null }[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"seance" | "constellation">("seance");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (puzzle: Record<string, unknown>) => {
    const t = textProblem(title, "The title", TITLE_MAX);
    if (t) { setError(t); return; }
    setBusy(true);
    setError(null);
    const r = await publish({ ...puzzle, title });
    setBusy(false);
    if (r.id) router.push(`/community/${r.id}`);
    else setError(r.error ?? "Could not publish the puzzle.");
  };

  return (
    <div className="space-y-5">
      <div role="tablist" className="grid grid-cols-2 gap-2 sm:max-w-md">
        {(["seance", "constellation"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setError(null); }} className={`min-h-12 rounded-[3px] border ${kind === k ? "border-brass bg-brass/15 text-paper" : "border-brass/25 text-ash hover:text-paper"}`}>
            {k === "seance" ? "Sorting table" : "Constellation"}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="smallcaps text-xs text-brass">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="Give it a name" className="mt-1 block min-h-12 w-full rounded-[3px] border border-brass/40 bg-ink/80 px-3 text-paper" />
      </label>
      {kind === "seance"
        ? <SeanceEditor entities={entities} busy={busy} onPublish={submit} />
        : <GridEditor facets={facets} heroes={heroes} busy={busy} onPublish={submit} />}
      {error && <p role="alert" className="rounded-sm border border-[#b0433f]/60 bg-[#b0433f]/10 px-3 py-2 text-sm text-[#f0b3b0]">{error}</p>}
    </div>
  );
}

// ───────────── sorting table ─────────────

function SeanceEditor({ entities, busy, onPublish }: { entities: Record<Entity, SeanceHero[]>; busy: boolean; onPublish: (p: Record<string, unknown>) => void }) {
  const [entity, setEntity] = useState<Entity>("hero");
  const [groups, setGroups] = useState<Group[]>(emptyGroups);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState("");
  const list = entities[entity];
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);
  const used = new Set(groups.flatMap((g) => g.members));
  const shown = useMemo(() => {
    const n = normalize(q);
    return list.filter((e) => !n || normalize(`${e.name} ${e.sub ?? ""}`).includes(n));
  }, [list, q]);

  const update = (i: number, g: Partial<Group>) => setGroups((gs) => gs.map((x, j) => (j === i ? { ...x, ...g } : x)));
  const add = (id: number) => {
    if (used.has(id)) {
      // Tapping a placed tile takes it off again.
      setGroups((gs) => gs.map((g) => ({ ...g, members: g.members.filter((m) => m !== id) })));
      return;
    }
    const target = groups[active].members.length < 4 ? active : groups.findIndex((g) => g.members.length < 4);
    if (target < 0) return;
    update(target, { members: [...groups[target].members, id] });
    if (groups[target].members.length === 3) {
      const next = groups.findIndex((g, j) => j !== target && g.members.length < 4);
      if (next >= 0) setActive(next);
    }
  };

  const problem = (() => {
    for (let i = 0; i < 4; i++) {
      const g = groups[i];
      if (g.members.length !== 4) return `Group ${i + 1} needs 4 ${NOUN[entity]} (${g.members.length} so far).`;
      const err = textProblem(g.label, `Group ${i + 1}'s name`, LABEL_MAX) ?? textProblem(g.explanation, `Group ${i + 1}'s explanation`, EXPLANATION_MAX, false);
      if (err) return err;
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ash">The tiles are</span>
        {(["hero", "item", "ability"] as const).map((e) => (
          <button
            key={e} type="button"
            onClick={() => { if (e !== entity && (!used.size || window.confirm("Switching clears the groups. Go on?"))) { setEntity(e); setGroups(emptyGroups()); setActive(0); } }}
            className={`min-h-11 rounded-[3px] border px-3 text-sm ${entity === e ? "border-brass bg-brass/15 text-paper" : "border-brass/25 text-ash hover:text-paper"}`}
          >
            {NOUN[e]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g, i) => (
          <div key={i} className={`rounded-[3px] border p-3 ${active === i ? "border-ecto shadow-[0_0_14px_rgba(127,227,194,0.25)]" : "border-brass/30"}`} onClick={() => setActive(i)}>
            <div className={`${BAND[i]} mb-2 rounded-[2px] px-2 py-1 text-center text-xs`}>Group {RANK[i]}</div>
            <input value={g.label} onChange={(e) => update(i, { label: e.target.value })} onFocus={() => setActive(i)} maxLength={LABEL_MAX} placeholder="What they share (shown once solved)" className="block min-h-11 w-full rounded-[3px] border border-brass/30 bg-ink/80 px-2 text-sm text-paper" />
            <input value={g.explanation} onChange={(e) => update(i, { explanation: e.target.value })} onFocus={() => setActive(i)} maxLength={EXPLANATION_MAX} placeholder="Explanation (optional)" className="mt-1.5 block min-h-11 w-full rounded-[3px] border border-brass/20 bg-ink/60 px-2 text-xs text-paper" />
            <ul className="mt-2 grid grid-cols-4 gap-1.5">
              {Array.from({ length: 4 }, (_, k) => {
                const e = byId.get(g.members[k]);
                return (
                  <li key={k}>
                    {e ? (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); add(e.id); }} title="Take off" className="flex w-full flex-col items-center gap-0.5 rounded-sm border border-brass/30 bg-iron p-1 text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {e.image ? <img src={e.image} alt="" className={`h-10 w-10 rounded-sm ${entity === "hero" ? "object-cover object-top" : "object-contain"}`} /> : <span className="h-10 w-10" />}
                        <span className="line-clamp-1 text-[0.65rem] text-paper">{e.name}</span>
                      </button>
                    ) : (
                      <span className="flex aspect-square w-full items-center justify-center rounded-sm border border-dashed border-brass/25 text-brass/40">+</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <DecoFrame className="p-3" corners={false}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ash">Tap to add to <span className="text-paper">group {active + 1}</span>; tap a placed one to take it off.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${NOUN[entity]}…`} className="min-h-11 w-full rounded-[3px] border border-brass/40 bg-ink/80 px-3 text-sm text-paper sm:w-56" />
        </div>
        <ul className="thin-scroll grid max-h-80 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6 md:grid-cols-8">
          {shown.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => add(e.id)} className={`flex w-full flex-col items-center gap-0.5 rounded-sm border p-1 text-center ${used.has(e.id) ? "border-ecto/60 bg-ecto/10 opacity-60" : "border-brass/20 bg-ink/50 hover:border-brass/70"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.image ? <img src={e.image} alt="" loading="lazy" className={`h-10 w-10 rounded-sm ${entity === "hero" ? "object-cover object-top" : "object-contain"}`} /> : <span className="h-10 w-10" />}
                <span className="line-clamp-2 text-[0.65rem] leading-tight text-paper">{e.name}</span>
                {e.sub && <span className="line-clamp-1 text-[0.6rem] text-ash">{e.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      </DecoFrame>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {problem && <p className="mr-auto text-sm text-ash">{problem}</p>}
        <Button
          disabled={!!problem || busy}
          onClick={() => onPublish({ kind: "seance", entity, groups: groups.map((g) => ({ label: g.label, explanation: g.explanation || undefined, members: g.members })) })}
        >
          {busy ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </div>
  );
}

// ───────────── Constellation ─────────────

function GridEditor({ facets, heroes, busy, onPublish }: { facets: FacetOption[]; heroes: { id: number; name: string; image: string | null }[]; busy: boolean; onPublish: (p: Record<string, unknown>) => void }) {
  const [rows, setRows] = useState<string[]>(["", "", ""]);
  const [cols, setCols] = useState<string[]>(["", "", ""]);
  const byId = useMemo(() => new Map(facets.map((f) => [f.id, f])), [facets]);
  const heroName = useMemo(() => new Map(heroes.map((h) => [h.id, h.name])), [heroes]);
  const picked = [...rows, ...cols].map((id) => byId.get(id));
  const dims = picked.filter(Boolean).map((f) => f!.dim);

  const cells = rows.flatMap((r) => cols.map((c) => {
    const a = byId.get(r), b = byId.get(c);
    if (!a || !b) return null;
    const bs = new Set(b.members);
    return a.members.filter((h) => bs.has(h));
  }));

  const problem = (() => {
    if (picked.some((f) => !f)) return "Pick three rows and three columns.";
    if (new Set(dims).size !== 6) return "Each row and column needs a different kind of category.";
    const thin = cells.findIndex((c) => (c?.length ?? 0) < MIN_PER_CELL);
    if (thin >= 0) return `Cell ${thin + 1} fits fewer than ${MIN_PER_CELL} heroes.`;
    return null;
  })();

  // The dropdowns are narrow on a phone: the chosen category is spelled out under each one.
  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <div>
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="min-h-11 w-full rounded-[3px] border border-cursed/40 bg-ink px-2 text-[0.7rem] text-paper sm:text-sm">
      <option value="">{label}…</option>
      {facets.map((f) => (
        <option key={f.id} value={f.id} disabled={f.id !== value && (dims.includes(f.dim) || [...rows, ...cols].includes(f.id))}>
          {f.label} ({f.members.length})
        </option>
      ))}
    </select>
    {byId.get(value) && <p className="mt-0.5 text-center text-[0.65rem] leading-tight text-paper/80">{byId.get(value)!.label}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-ash">Pick a category for every row and column. Each of the six must be a different kind (two weapon types can&apos;t both be used), and every cell needs at least {MIN_PER_CELL} heroes who fit both.</p>
      <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-1.5">
        <div />
        {cols.map((c, i) => <div key={i}>{select(c, (v) => setCols((cs) => cs.map((x, j) => (j === i ? v : x))), `Column ${i + 1}`)}</div>)}
        {rows.map((r, ri) => (
          <div key={ri} className="contents">
            <div>{select(r, (v) => setRows((rs) => rs.map((x, j) => (j === ri ? v : x))), `Row ${ri + 1}`)}</div>
            {[0, 1, 2].map((ci) => {
              const c = cells[ri * 3 + ci];
              const ok = c && c.length >= MIN_PER_CELL;
              return (
                <div key={ci} title={c?.map((id) => heroName.get(id)).join(", ")} className={`flex aspect-square flex-col items-center justify-center rounded-sm border text-center ${!c ? "border-brass/20 bg-ink/40 text-brass/40" : ok ? "border-ecto/50 bg-ecto/10 text-ecto" : "border-[#b0433f]/60 bg-[#b0433f]/10 text-[#f0b3b0]"}`}>
                  <span className="font-mono text-xl">{c ? c.length : "✦"}</span>
                  {c && <span className="text-[0.6rem] text-ash">{c.length === 1 ? "hero" : "heroes"}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {problem && <p className="mr-auto text-sm text-ash">{problem}</p>}
        <Button disabled={!!problem || busy} onClick={() => onPublish({ kind: "constellation", rows, cols })}>{busy ? "Publishing…" : "Publish"}</Button>
      </div>
    </div>
  );
}
