// Server-safe admin helpers (no hooks).
/** Modes whose answer (or subject) is a hero, in Vault order. */
export const HERO_MODE_OPTIONS = [
  ["classic", "Reckoning"], ["splash", "Visage"], ["ability-icon", "Sigil"], ["lore", "Testament"],
  ["ability-desc", "Incantation"], ["whose-build", "Belongings"], ["upgrades", "Ascension"], ["emoji", "Cipher"],
  ["quote", "Echo"], ["quote-cast", "Utterance"], ["quote-convo", "Colloquy"], ["hero-sound", "Resonance"],
  ["silhouette", "Shadow"], ["weapon", "Arsenal"], ["ability-stats", "Calculus"], ["decoy", "Decoy"], ["constellation", "Constellation"],
] as const;
/** Modes whose answer is an item. The Decoy's fake can be any item: excluding one here keeps it out. */
export const ITEM_MODE_OPTIONS = [
  ["item-picture", "Relic"], ["item-classic", "Appraisal"], ["build-path", "Lineage"], ["stat-bonus", "Measure"], ["decoy", "Decoy"],
] as const;
/** Every mode that can be switched off per hero, ability or item. */
export const MODE_OPTIONS = [...HERO_MODE_OPTIONS, ...ITEM_MODE_OPTIONS.filter(([m]) => m !== "decoy")] as const;

export function ExcludeBoxes({ selected, modes }: { selected: string[]; modes: readonly (readonly [string, string])[] }) {
  return (
    <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <legend className="mb-1 text-xs text-neutral-500">Exclude from modes</legend>
      {modes.map(([id, label]) => (
        <label key={id} className="inline-flex items-center gap-1">
          <input type="checkbox" name="exclude" value={id} defaultChecked={selected.includes(id)} /> {label}
        </label>
      ))}
    </fieldset>
  );
}
