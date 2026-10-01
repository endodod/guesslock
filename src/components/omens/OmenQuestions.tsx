"use client";
// Prediction panel: all questions at once, then "Lock in" (confirmed; answers can't change after).
import type { BeastAnswer, ClashAnswer, OmenAnswer, OmenKind, OmenSnapshot, RiftAnswer, Team } from "@/lib/omens/types";
import { Keyhole } from "../ui";
import { TEAM_COLOR } from "./OmenMap";
import { TEAM_LABEL } from "./OmenPanels";

export type Draft = {
  any: boolean | null; // Clash: anyone dies / Beast: midboss killed
  deaths: Record<Team, number>;
  died: number[];
  killer: Team | null;
  claimer: Team | "none" | null;
  rejuvs: Record<Team, number>;
};

export function emptyDraft(s: OmenSnapshot): Draft {
  return {
    any: null, deaths: { amber: 0, sapphire: 0 }, died: [], killer: null, claimer: null,
    rejuvs: { amber: s.teams.amber.rejuvs, sapphire: s.teams.sapphire.rejuvs },
  };
}

/** Draft -> answer, or null while something required is missing. */
export function draftAnswer(omen: OmenKind, d: Draft): OmenAnswer | null {
  if (omen === "clash") {
    if (d.any === null) return null;
    const a: ClashAnswer = d.any ? { anyDeath: true, deaths: d.deaths, died: d.died } : { anyDeath: false, deaths: { amber: 0, sapphire: 0 }, died: [] };
    return a;
  }
  if (omen === "beast") {
    // The midboss always falls: who kills it, and how many rejuvs each team has afterwards.
    if (!d.killer) return null;
    const a: BeastAnswer = { killed: true, killer: d.killer, claimer: d.killer, rejuvs: d.rejuvs };
    return a;
  }
  if (!d.claimer) return null;
  const a: RiftAnswer = { claimer: d.claimer, deaths: d.deaths };
  return a;
}

function Choice<T extends string | boolean>({
  label, value, options, onChange, disabled,
}: { label: string; value: T | null; options: { v: T; label: string; color?: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className={`space-y-2 ${disabled ? "opacity-40" : ""}`}>
      <legend className="mb-1.5 text-paper">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {options.map((o) => {
          const on = value === o.v;
          return (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.v)}
              className={`min-h-11 min-w-24 rounded-[3px] border px-4 text-[0.95rem] transition-colors ${on ? "border-brass bg-brass/20 text-paper" : "border-brass/30 text-paper/85 hover:border-brass/60"}`}
              style={on && o.color ? { borderColor: o.color, boxShadow: `inset 0 0 0 1px ${o.color}` } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Stepper({ label, value, onChange, color, min = 0, max = 6, disabled }: { label: string; value: number; onChange: (n: number) => void; color: string; min?: number; max?: number; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-sm border border-brass/20 bg-ink/40 px-3 py-1.5 ${disabled ? "opacity-40" : ""}`}>
      <span style={{ color }}>{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`${label}: fewer`} className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-brass/40 font-mono text-lg text-brass disabled:opacity-30">−</button>
        <output className="w-8 text-center font-mono text-xl text-paper" aria-live="polite">{value}</output>
        <button type="button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`${label}: more`} className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-brass/40 font-mono text-lg text-brass disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

const teamOptions: { v: Team; label: string; color: string }[] = [
  { v: "amber", label: "Amber", color: "var(--amber)" },
  { v: "sapphire", label: "Sapphire", color: "var(--sapphire)" },
];

export function OmenQuestions({
  omen, snapshot, draft, setDraft, pickedNames, onLockIn, busy,
}: {
  omen: OmenKind; snapshot: OmenSnapshot; draft: Draft; setDraft: (d: Draft) => void;
  pickedNames: string[]; onLockIn: () => void; busy?: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const ready = draftAnswer(omen, draft) !== null;
  const w = snapshot.window;

  return (
    <div className="space-y-5">
      {omen === "clash" && (
        <>
          <Choice label={`Does anyone die in the next ${w} s?`} value={draft.any} onChange={(v) => set({ any: v })} options={[{ v: true, label: "Yes" }, { v: false, label: "No" }]} />
          <div className={`space-y-2 ${draft.any === false ? "opacity-40" : ""}`}>
            <p className="text-paper">Deaths per team</p>
            <Stepper label="Amber" color="var(--amber)" value={draft.deaths.amber} disabled={draft.any === false} onChange={(n) => set({ deaths: { ...draft.deaths, amber: n } })} />
            <Stepper label="Sapphire" color="var(--sapphire)" value={draft.deaths.sapphire} disabled={draft.any === false} onChange={(n) => set({ deaths: { ...draft.deaths, sapphire: n } })} />
          </div>
          <div className={draft.any === false ? "opacity-40" : ""}>
            <p className="text-paper">Who dies?</p>
            <p className="text-sm text-ash">Tap heroes on the map or in the team lists. Pick none if you think nobody does.</p>
            <p className="mt-1 text-sm text-paper/90">{pickedNames.length ? pickedNames.join(", ") : "Nobody picked"}</p>
          </div>
        </>
      )}

      {omen === "beast" && (
        <>
          <p className="text-sm text-ash">The midboss is killed within the next {w} s.</p>
          <Choice label="Which team kills it?" value={draft.killer} onChange={(v) => set({ killer: v })} options={teamOptions} />
          <div className="space-y-2">
            <p className="text-paper">How many rejuvs does each team have afterwards?</p>
            <Stepper label="Amber" color="var(--amber)" value={draft.rejuvs.amber} onChange={(n) => set({ rejuvs: { ...draft.rejuvs, amber: n } })} />
            <Stepper label="Sapphire" color="var(--sapphire)" value={draft.rejuvs.sapphire} onChange={(n) => set({ rejuvs: { ...draft.rejuvs, sapphire: n } })} />
          </div>
        </>
      )}

      {omen === "rift" && (
        <>
          <Choice label="Which team claims the rift?" value={draft.claimer} onChange={(v) => set({ claimer: v })} options={[...teamOptions, { v: "none" as const, label: "Nobody (it expires)" }]} />
          <div className="space-y-2">
            <p className="text-paper">Deaths at the rift per team</p>
            <Stepper label="Amber" color="var(--amber)" value={draft.deaths.amber} onChange={(n) => set({ deaths: { ...draft.deaths, amber: n } })} />
            <Stepper label="Sapphire" color="var(--sapphire)" value={draft.deaths.sapphire} onChange={(n) => set({ deaths: { ...draft.deaths, sapphire: n } })} />
          </div>
        </>
      )}

      <button
        type="button"
        disabled={!ready || busy}
        onClick={onLockIn}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[3px] border border-brass bg-brass/15 px-6 font-display text-lg text-brass transition-colors hover:bg-brass/25 disabled:opacity-40 sm:w-auto"
      >
        <Keyhole className="h-5 w-4" /> Lock in
      </button>
      {!ready && <p className="text-sm text-ash">Answer every question to lock in.</p>}
    </div>
  );
}

export { TEAM_COLOR, TEAM_LABEL };
