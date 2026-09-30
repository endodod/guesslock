// Server-safe admin helpers (no hooks).
export const MODE_OPTIONS = [
  ["classic", "Reckoning"], ["splash", "Visage"], ["ability-icon", "Sigil"], ["lore", "Testament"],
  ["ability-desc", "Incantation"], ["whose-build", "Belongings"], ["upgrades", "Ascension"], ["emoji", "Cipher"],
  ["quote", "Echo"], ["item-picture", "Relic"], ["item-classic", "Appraisal"], ["build-path", "Lineage"], ["stat-bonus", "Measure"],
] as const;

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
