import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { mediaUrl } from "@/lib/media";
import type { NormAbility, NormHero } from "@/lib/deadlock/types";
import { usableText } from "@/lib/text/entries";
import { saveAbility } from "../actions";
import { ExcludeBoxes, MODE_OPTIONS } from "../shared";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";

const ABILITY_MODES = MODE_OPTIONS.filter(([m]) => ["ability-icon", "ability-desc", "upgrades", "hero-sound", "ability-stats"].includes(m));
const TEXTS = [["ability_desc", "Description"], ["ability_t1", "T1"], ["ability_t2", "T2"], ["ability_t3", "T3"]] as const;

export default async function AbilitiesAdmin() {
  await requireAdminPage();
  const [heroes, texts] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } } } }),
    db.textEntry.findMany({ where: { entityType: { in: TEXTS.map(([t]) => t) } } }),
  ]);
  const text = new Map(texts.map((t) => [`${t.entityType}:${Number(t.entityId)}`, t]));

  const totalAbilities = heroes.reduce((acc, h) => acc + h.abilities.length, 0);
  const totalExcluded = heroes.reduce((acc, h) => acc + h.abilities.filter((a) => a.excludeFromModes.length > 0).length, 0);
  const completeTextsCount = heroes.reduce(
    (acc, h) => acc + h.abilities.filter((a) => TEXTS.every(([t]) => usableText(text.get(`${t}:${Number(a.id)}`)))).length,
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abilities"
        subtitle="Used by The Sigil (icon), The Incantation (description) and The Ascension (upgrades). Per-ability aliases and mode inclusion."
        actions={
          <Link href="/admin/texts?type=ability_desc" className="text-xs text-blue-700 hover:underline">
            Manage redacting texts ↗
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Total Abilities" value={totalAbilities} sub={`${heroes.length} active heroes`} />
        <Stat label="Fully Documented" value={completeTextsCount} tone={completeTextsCount === totalAbilities ? "green" : "amber"} sub="Desc & T1-T3 texts ready" />
        <Stat label="Mode Exclusions" value={totalExcluded} tone={totalExcluded > 0 ? "amber" : "slate"} sub="Excluded from some locks" />
      </div>

      <div className="space-y-4">
        {heroes.map((h) => {
          const heroSrc = h.source as unknown as NormHero;
          const heroImg = mediaUrl(heroSrc?.images?.small) ?? mediaUrl(heroSrc?.images?.card);

          return (
            <Card key={h.id}>
              <div className="mb-3 flex items-center justify-between border-b border-neutral-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  {heroImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={heroImg} alt="" className="h-7 w-7 rounded-full border border-neutral-200 bg-neutral-900 object-cover" />
                  ) : null}
                  <span className="font-semibold text-neutral-900">{h.name}</span>
                </div>
                <Link
                  href={`/admin/texts?type=ability_desc&hero=${h.id}&filter=all`}
                  className="text-xs text-blue-700 hover:underline"
                >
                  Edit Texts ↗
                </Link>
              </div>

              <div className="divide-y divide-neutral-100">
                {h.abilities.map((a) => {
                  const src = a.source as unknown as NormAbility;
                  const icon = mediaUrl(src.image);

                  return (
                    <form
                      key={String(a.id)}
                      id={`ability-${a.id}`}
                      action={saveAbility.bind(null, Number(a.id))}
                      className="flex flex-wrap items-center gap-3 py-2.5 text-sm"
                    >
                      <div className="flex w-52 items-center gap-3">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" className="h-9 w-9 shrink-0 rounded border border-neutral-700 bg-neutral-900 object-contain p-1 shadow-sm" />
                        ) : (
                          <div className="h-9 w-9 shrink-0 rounded border border-neutral-200 bg-neutral-100" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-neutral-900">{a.name}</p>
                          <div className="flex items-center gap-1.5">
                            <Pill tone={a.slot === 4 ? "indigo" : "slate"}>
                              {a.slot === 4 ? "Ultimate" : `Slot ${a.slot}`}
                            </Pill>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        {TEXTS.map(([t, label]) => {
                          const ok = usableText(text.get(`${t}:${Number(a.id)}`));
                          return (
                            <span
                              key={t}
                              title={ok ? `${label} text present` : `Missing ${label} text`}
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                                ok ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20" : "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20"
                              }`}
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>

                      <div className="min-w-44 flex-1">
                        <input
                          name="aliases"
                          defaultValue={a.aliases.join(", ")}
                          placeholder="Search & redaction aliases (comma-separated)"
                          className="w-full rounded border border-neutral-300 bg-neutral-50/50 px-2.5 py-1 text-xs text-neutral-800 transition focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <ExcludeBoxes selected={a.excludeFromModes} modes={ABILITY_MODES} />

                      <button
                        type="submit"
                        className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:bg-neutral-100"
                      >
                        Save
                      </button>
                    </form>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
