import Link from "next/link";
import { db } from "@/lib/db";
import { readSetting, settingsReady } from "@/lib/settings";
import { requireAdminPage } from "@/lib/admin/auth";
import type { NormHero } from "@/lib/deadlock/types";
import { DEFAULT_WEAPON_GROUPS, WEAPON_GROUPS_KEY, parseWeaponGroups, weaponFamily, weaponInfo, weaponKey } from "@/lib/engine/columns";
import { Card, PageHeader, Pill, Stat } from "../kit";
import { ActionButton } from "../ui";
import { rebuildDataPuzzles } from "../categories/actions";
import { resetWeaponGroups, saveWeaponGroups } from "./actions";

export const dynamic = "force-dynamic";
// "Rebuild future puzzles" runs the generator inside the action.
export const maxDuration = 300;

const input = "rounded border border-neutral-300 px-2 py-1 text-sm";

export default async function WeaponGroups() {
  await requireAdminPage();
  const [row, ready, heroRows] = await Promise.all([
    readSetting(WEAPON_GROUPS_KEY),
    settingsReady(),
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, source: true, weaponTypeOverride: true } }),
  ]);
  const groups = parseWeaponGroups(row?.value);
  const heroes = heroRows.map((h) => {
    const api = (h.source as unknown as NormHero).gunTag;
    const type = h.weaponTypeOverride || api;
    return { id: h.id, name: h.name, override: h.weaponTypeOverride, type, family: weaponFamily(type, groups) };
  });
  const usersOf = (t: string) => heroes.filter((h) => h.type && weaponKey(h.type) === t);

  // Every weapon type in the table or in use (API tag or admin override).
  const types = [...new Set([...Object.keys(groups), ...heroes.flatMap((h) => (h.type ? [weaponKey(h.type)] : []))])].sort();
  const families = [...new Set([...Object.values(groups), ...Object.values(DEFAULT_WEAPON_GROUPS)])].sort();
  const byFamily = new Map<string, typeof heroes>();
  for (const h of heroes) {
    const f = h.family ?? "(no weapon type)";
    byFamily.set(f, [...(byFamily.get(f) ?? []), h]);
  }
  const ungrouped = types.filter((t) => !groups[t] && usersOf(t).length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weapon groups"
        subtitle="The Reckoning's Weapon column shows a family, not the raw weapon type: types in the same family match. A hero's type is the API's unless it is set on the hero page or in the data grid."
        actions={<Link href="/admin/categories?entity=hero#values" className="text-sm text-blue-700 hover:underline">Hero data grid</Link>}
      />

      {!ready && (
        <p role="alert" className="rounded border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This database has no settings table yet (a migration is pending), so the default groups are shown and saving is off.
          Run <code>npx prisma migrate deploy</code> against this database, or deploy, to create it.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Families" value={byFamily.size} sub={`${types.length} weapon types`} />
        <Stat label="Source" value={row ? "Edited" : "Default"} tone={row ? "green" : "slate"} sub={row ? `saved ${row.updatedAt.toISOString().slice(0, 10)}` : "built-in table"} />
        <Stat label="Ungrouped types" value={ungrouped.length} tone={ungrouped.length ? "amber" : "green"} sub={ungrouped.length ? ungrouped.join(", ") : "every type in use has a family"} />
        <Stat label="Heroes" value={heroes.length} sub="active" />
      </div>

      <Card title="Families" hint={weaponInfo(groups)}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...byFamily].sort(([a], [b]) => a.localeCompare(b)).map(([fam, list]) => (
            <li key={fam} className="rounded border border-neutral-200 p-3">
              <p className="font-semibold">{fam} <span className="text-xs font-normal text-neutral-500">· {list.length}</span></p>
              <p className="mt-1 text-sm text-neutral-700">
                {list.map((h, i) => (
                  <span key={h.id}>
                    {i > 0 && ", "}
                    <Link href={`/admin/heroes/${h.id}#attributes`} className="hover:underline">{h.name}</Link>
                    <span className="text-xs text-neutral-500"> ({h.type ?? "none"}{h.override ? ", override" : ""})</span>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Weapon types" hint="Give each type a family; types with the same family match each other. An empty family makes the type its own family.">
        <form action={saveWeaponGroups}>
          <datalist id="families">{families.map((f) => <option key={f} value={f} />)}</datalist>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="py-2 pr-4">Weapon type</th><th className="pr-4">Family</th><th className="pr-4">Heroes</th><th>Default</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {types.map((t) => {
                const users = usersOf(t);
                const def = DEFAULT_WEAPON_GROUPS[t];
                return (
                  <tr key={t}>
                    <td className="py-1.5 pr-4 font-medium capitalize">{t}</td>
                    <td className="pr-4"><input name={`g|${t}`} defaultValue={groups[t] ?? ""} list="families" placeholder="own family" className={`${input} w-48`} /></td>
                    <td className="pr-4 text-neutral-700">
                      {users.length ? users.map((h) => `${h.name}${h.override ? " (override)" : ""}`).join(", ") : <span className="text-neutral-400">none</span>}
                    </td>
                    <td className="text-xs text-neutral-500">{def ?? <Pill tone="amber">new type</Pill>}</td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-2 pr-4"><input name="newType" placeholder="add a weapon type" className={`${input} w-44`} /></td>
                <td className="pr-4"><input name="newFamily" list="families" placeholder="family" className={`${input} w-48`} /></td>
                <td colSpan={2} className="text-xs text-neutral-500">For a type no hero has yet, e.g. ahead of a new hero.</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button disabled={!ready} className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40">Save groups</button>
            <ActionButton label="Reset to defaults" confirm="Drop the edited table and use the built-in weapon groups again?" action={resetWeaponGroups} />
            <ActionButton
              label="Rebuild future puzzles with these groups"
              confirm="Drop the future Reckoning and Constellation puzzles and build them again with the current weapon groups?"
              action={rebuildDataPuzzles.bind(null, "hero")}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500">Saved groups reach puzzles built afterwards. Rebuild the future days so they use them too; today&apos;s puzzles stay as they are.</p>
        </form>
      </Card>
    </div>
  );
}
