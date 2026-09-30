import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { mediaUrl } from "@/lib/media";
import type { NormAbility } from "@/lib/deadlock/types";
import { usableText } from "@/lib/text/entries";
import { saveAbility } from "../actions";
import { ExcludeBoxes, MODE_OPTIONS } from "../shared";

export const dynamic = "force-dynamic";

const ABILITY_MODES = MODE_OPTIONS.filter(([m]) => ["ability-icon", "ability-desc", "upgrades"].includes(m));
const TEXTS = [["ability_desc", "Description"], ["ability_t1", "T1"], ["ability_t2", "T2"], ["ability_t3", "T3"]] as const;

// Site-wide ability settings: aliases (search and redaction) and which ability locks may use each ability.
export default async function AbilitiesAdmin() {
  await requireAdminPage();
  const [heroes, texts] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } } } }),
    db.textEntry.findMany({ where: { entityType: { in: TEXTS.map(([t]) => t) } } }),
  ]);
  const text = new Map(texts.map((t) => [`${t.entityType}:${Number(t.entityId)}`, t]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Abilities</h1>
        <p className="text-sm text-neutral-600">
          Used by The Sigil (icon), The Incantation (description) and The Ascension (upgrades). Unticking a lock here removes the ability from
          that lock everywhere; the per-puzzle pages show the same switches. Texts are edited under <Link href="/admin/texts?type=ability_desc" className="text-blue-700 hover:underline">Texts</Link>.
        </p>
      </div>
      {heroes.map((h) => (
        <section key={h.id} className="rounded border border-neutral-300 bg-white p-3">
          <h2 className="mb-1 font-semibold">
            {h.name} <Link href={`/admin/texts?type=ability_desc&hero=${h.id}&filter=all`} className="ml-2 text-xs font-normal text-blue-700 hover:underline">texts</Link>
          </h2>
          <ul>
            {h.abilities.map((a) => {
              const src = a.source as unknown as NormAbility;
              const icon = mediaUrl(src.image);
              return (
                <li key={String(a.id)} id={`ability-${a.id}`}>
                  <form action={saveAbility.bind(null, Number(a.id))} className="flex flex-wrap items-center gap-3 border-t border-neutral-200 py-1.5 text-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {icon ? <img src={icon} alt="" className="h-8 w-8 rounded bg-neutral-800 object-contain p-0.5" /> : <span className="h-8 w-8" />}
                    <div className="w-44"><strong>{a.name}</strong><div className="text-xs text-neutral-500">{a.slot === 4 ? "Ultimate" : `Ability ${a.slot}`}</div></div>
                    <span className="flex gap-1 text-xs">
                      {TEXTS.map(([t, label]) => (
                        <span key={t} className={`rounded px-1 ${usableText(text.get(`${t}:${Number(a.id)}`)) ? "bg-green-100 text-green-800" : "bg-red-50 text-red-700"}`}>{label}</span>
                      ))}
                    </span>
                    <label className="min-w-40 flex-1">
                      <input name="aliases" defaultValue={a.aliases.join(", ")} placeholder="Aliases" className="w-full rounded border border-neutral-400 px-2 py-0.5" />
                    </label>
                    <ExcludeBoxes selected={a.excludeFromModes} modes={ABILITY_MODES} />
                    <button className="rounded border border-neutral-400 px-2 py-0.5">Save</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
