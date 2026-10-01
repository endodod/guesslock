import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { soundEligible } from "@/lib/engine/modes/hero";
import { mediaUrl } from "@/lib/media";
import type { NormAbility } from "@/lib/deadlock/types";
import { ActionButton } from "../ui";
import { runMeasure, runSoundImport, saveSoundMap } from "./actions";
import { ClipTable, type ClipRowData } from "./ClipTable";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";

export default async function SoundsAdmin({ searchParams }: { searchParams: Promise<{ hero?: string; show?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const [heroes, maps, counts, lastRun] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } } } }),
    db.heroSoundMap.findMany(),
    db.soundClip.groupBy({ by: ["heroId", "abilityId", "kind", "status", "role"], _count: true }),
    db.syncRun.findFirst({ where: { kind: "sounds" }, orderBy: { id: "desc" } }),
  ]);
  const mapBy = new Map(maps.map((m) => [m.heroId, m]));
  const approvedOf = (abilityId: bigint) =>
    counts.filter((c) => c.abilityId === abilityId && c.status === "approved").flatMap((c) => Array<{ role: string }>(c._count).fill({ role: c.role }));
  const heroRows = heroes.map((h) => {
    const eligible = h.abilities.filter((a) => soundEligible(approvedOf(a.id))).length;
    const n = (pred: (c: (typeof counts)[number]) => boolean) => counts.filter((c) => c.heroId === h.id && pred(c)).reduce((a, c) => a + c._count, 0);
    return {
      h, eligible,
      approved: n((c) => c.status === "approved" && c.kind === "ability"),
      suggested: n((c) => c.status === "suggested" && c.kind === "ability"),
      gun: n((c) => c.status === "approved" && c.kind === "weapon"),
    };
  });
  const heroId = sp.hero ? Number(sp.hero) : undefined;
  const hero = heroes.find((h) => h.id === heroId);
  const showAll = sp.show === "all";
  const unmeasured = await db.soundClip.count({ where: { status: "suggested", measuredAt: null, missing: false } });

  const eligibleCount = heroRows.filter((r) => r.eligible > 0).length;
  const totalApproved = heroRows.reduce((acc, r) => acc + r.approved, 0);
  const totalSuggested = heroRows.reduce((acc, r) => acc + r.suggested, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="The Resonance — Sounds"
        subtitle="Manage audio clip curation and loudness gain normalization for ability cast audio."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton action={runSoundImport} label="Import sound index now" />
            <ActionButton action={runMeasure.bind(null, undefined)} label="Measure pending clips" />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Eligible Heroes" value={`${eligibleCount} / ${heroes.length}`} tone={eligibleCount === heroes.length ? "green" : "amber"} sub="With 1 cast + 2 approved" />
        <Stat label="Approved Clips" value={totalApproved} tone="green" sub="Mirrored and active" />
        <Stat label="Suggested Clips" value={totalSuggested} tone={totalSuggested > 0 ? "amber" : "slate"} sub="Awaiting approval" />
        <Stat label="Unmeasured Clips" value={unmeasured} sub={lastRun ? `Last import: ${lastRun.status}` : "Never"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
        <Card title="Hero Roster" hint="Select a hero to curate audio">
          <div className="max-h-[700px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-500">
                <tr>
                  <th className="py-2 pl-2 pr-3">Hero</th>
                  <th className="px-2 py-2 text-center" title="Eligible abilities">Elig.</th>
                  <th className="px-2 py-2 text-center" title="Approved ability clips">Appr.</th>
                  <th className="py-2 pl-2 pr-2 text-center" title="Approved gun clips">Gun</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {heroRows.map(({ h, eligible, approved, gun, suggested }) => (
                  <tr key={h.id} className={`transition hover:bg-neutral-50 ${h.id === heroId ? "bg-blue-50/70 font-semibold" : ""}`}>
                    <td className="py-2 pl-2 pr-3">
                      <Link className="hover:text-blue-600 hover:underline" href={`/admin/sounds?hero=${h.id}`}>
                        {h.name}
                      </Link>
                      {!mapBy.get(h.id)?.abilityFolders.length && (
                        <span className="ml-1 text-[10px] text-red-600 font-normal">no folder</span>
                      )}
                      {h.excludeFromModes.includes("hero-sound") && (
                        <span className="ml-1 text-[10px] text-neutral-400 font-normal">off</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {eligible > 0 ? <Pill tone="green">{eligible}</Pill> : <span className="text-neutral-400">0</span>}
                    </td>
                    <td className="px-2 py-2 text-center font-mono text-neutral-700" title={`${suggested} suggested`}>
                      {approved}
                    </td>
                    <td className="py-2 pl-2 pr-2 text-center font-mono text-neutral-500">
                      {gun || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {hero ? (
          <HeroSounds heroId={hero.id} showAll={showAll} />
        ) : (
          <Card className="flex h-64 items-center justify-center text-center">
            <div>
              <p className="font-medium text-neutral-700">Select a hero from the roster</p>
              <p className="text-xs text-neutral-400">View and approve sound clips for abilities and weapon audio</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

async function HeroSounds({ heroId, showAll }: { heroId: number; showAll: boolean }) {
  const hero = await db.hero.findUniqueOrThrow({ where: { id: heroId }, include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } }, soundMap: true } });
  const clips = await db.soundClip.findMany({
    where: { heroId, ...(showAll ? {} : { OR: [{ status: { not: "excluded" } }, { manual: true }, { kind: "ability", abilityId: null }] }) },
    orderBy: [{ status: "asc" }, { role: "asc" }, { sourcePath: "asc" }],
  });
  const abilities = hero.abilities.map((a) => ({ id: Number(a.id), name: a.name, slot: a.slot, icon: mediaUrl((a.source as unknown as NormAbility).image) }));
  const row = (c: (typeof clips)[number]): ClipRowData => ({
    id: c.id, name: c.sourcePath.split("/").slice(2).join("/"), folder: c.sourcePath.split("/").slice(0, 2).join("/"), url: c.sourceUrl,
    kind: c.kind as "ability" | "weapon", role: c.role, status: c.status, abilityId: c.abilityId === null ? null : Number(c.abilityId),
    score: c.score, preferred: c.preferred, reason: c.autoReason, changed: c.changed, missing: c.missing, manual: c.manual,
    durationMs: c.durationMs, loudnessDb: c.loudnessDb, gainDb: c.gainDb, mirrored: !!c.assetId,
  });
  const inputStyle = "w-full rounded border border-neutral-300 bg-neutral-50/50 px-2.5 py-1 text-xs text-neutral-800 transition focus:border-blue-500 focus:bg-white focus:outline-none";
  const q = showAll ? "" : "&show=all";

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{hero.name}</h2>
            <p className="text-xs text-neutral-500">{hero.className}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="text-xs text-blue-700 hover:underline" href={`/admin/sounds?hero=${heroId}${q}`}>
              {showAll ? "Hide excluded clips" : "Show excluded clips too"}
            </Link>
            <ActionButton action={runMeasure.bind(null, heroId)} label="Measure pending" />
            <Link className="text-xs text-neutral-500 hover:underline" href={`/admin/heroes/${heroId}`}>
              Hero details ↗
            </Link>
          </div>
        </div>

        <form action={saveSoundMap.bind(null, heroId)} className="grid gap-3 text-xs md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="font-medium text-neutral-700">Ability Folders</span>
            <span className="ml-1 text-[11px] text-neutral-400">(under abilities/, comma-separated)</span>
            <input name="abilityFolders" defaultValue={hero.soundMap?.abilityFolders.join(", ") ?? ""} className={`${inputStyle} mt-1`} />
          </label>
          <label className="block">
            <span className="font-medium text-neutral-700">Weapon Folders</span>
            <span className="ml-1 text-[11px] text-neutral-400">(under weapons/)</span>
            <input name="weaponFolders" defaultValue={hero.soundMap?.weaponFolders.join(", ") ?? ""} className={`${inputStyle} mt-1`} />
          </label>
          <button type="submit" className="rounded bg-neutral-900 px-3.5 py-1.5 font-medium text-white shadow-sm transition hover:bg-neutral-800">
            Save Folders
          </button>
        </form>
      </Card>

      <Card title="Clips" hint="★ preferred clip 1 · Audio normalized to −20 dBFS">
        <ClipTable heroId={heroId} abilities={abilities} clips={clips.map(row)} />
      </Card>
    </div>
  );
}
