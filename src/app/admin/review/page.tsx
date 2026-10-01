import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { ECHO_MIN_LINES, soundEligible } from "@/lib/engine/modes/hero";
import { acceptAllPendingReview, markAllReviewed, markReviewed } from "../actions";
import { ActionButton } from "../ui";
import { SEANCE_LOCKS } from "@/locks.config";
import { todayDate } from "@/lib/day";
import { addDays } from "@/lib/time";
import { loadCategoryRows } from "@/lib/seance/library";
import { completeness } from "@/lib/seance/rules";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";

export default async function ReviewQueue() {
  await requireAdminPage();
  const [heroes, items, abilities, texts, voiceCounts, soundMaps, soundCounts] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { abilities: { where: { active: true }, select: { id: true } } } }),
    db.item.findMany({ where: { needsReview: true }, orderBy: { name: "asc" } }),
    db.ability.findMany({ where: { needsReview: true }, orderBy: { name: "asc" } }),
    db.textEntry.groupBy({ by: ["entityType", "status", "stale"], _count: true }),
    db.voiceLine.groupBy({ by: ["heroId"], where: { status: { not: "excluded" } }, _count: true }),
    db.heroSoundMap.findMany(),
    db.soundClip.groupBy({ by: ["abilityId", "status", "role"], where: { kind: "ability", abilityId: { not: null }, status: { not: "excluded" } }, _count: true }),
  ]);

  const mapped = new Set(soundMaps.filter((m) => m.abilityFolders.length).map((m) => m.heroId));
  const noSoundFolder = heroes.filter((h) => !mapped.has(h.id));
  const clipsOf = (id: bigint, status: string) => soundCounts.filter((c) => c.abilityId === id && c.status === status).flatMap((c) => Array<{ role: string }>(c._count).fill({ role: c.role }));
  const soundBacklog = heroes
    .map((h) => ({
      h,
      n: h.abilities.filter((a) => !soundEligible(clipsOf(a.id, "approved")) && soundEligible([...clipsOf(a.id, "approved"), ...clipsOf(a.id, "suggested")])).length,
    }))
    .filter((x) => x.n > 0);
  const flagged = heroes.filter((h) => h.needsReview);
  const approvedLines = new Map(voiceCounts.map((v) => [v.heroId, v._count]));
  const fewLines = heroes.filter((h) => !h.genericVoice && (approvedLines.get(h.id) ?? 0) < ECHO_MIN_LINES);
  const pendingTexts = texts.filter((t) => t.status === "auto" || t.stale);

  const [categories, sealedTables] = await Promise.all([
    loadCategoryRows({ status: { not: "retired" } }),
    db.dailyPuzzle.findMany({
      where: { mode: { in: SEANCE_LOCKS.map((l) => l.slug) }, sealed: true, date: { gte: addDays(todayDate(), -7) } },
      orderBy: [{ date: "desc" }, { mode: "asc" }],
    }),
  ]);
  const activeIds = heroes.map((h) => h.id);
  const heroName = new Map(heroes.map((h) => [h.id, h.name]));
  const incomplete = categories.map((c) => ({ c, unknown: completeness(c.memberships, activeIds).unknown })).filter((x) => x.unknown.length > 0);
  const changed = categories.filter((c) => c.flagged);

  const totalFlagged = flagged.length + items.length + abilities.length;
  const totalPendingTexts = pendingTexts.reduce((a, t) => a + t._count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Queue"
        subtitle="Unreviewed sync changes, incomplete data sets, and anomalies requiring curator attention."
        actions={
          totalFlagged === 0 && incomplete.length === 0 && totalPendingTexts === 0 && changed.length === 0 ? (
            <span className="text-xs text-neutral-400">Everything in sync</span>
          ) : (
            <ActionButton action={acceptAllPendingReview} label="Accept all pending" confirm="Accept every flagged entity, pending text, and flagged Seance category currently shown in the review queue?" />
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Flagged Entities" value={totalFlagged} tone={totalFlagged > 0 ? "amber" : "green"} sub={`${flagged.length}H / ${items.length}I / ${abilities.length}A`} />
        <Stat label="Incomplete Séance" value={incomplete.length} tone={incomplete.length > 0 ? "red" : "green"} sub={`${changed.length} sync-changed`} />
        <Stat label="Pending Texts" value={totalPendingTexts} tone={totalPendingTexts > 0 ? "amber" : "green"} sub="Auto-redacted" />
        <Stat label="Sound Backlog" value={soundBacklog.reduce((a, x) => a + x.n, 0)} tone={soundBacklog.length > 0 ? "amber" : "green"} sub={`${noSoundFolder.length} without folders`} />
      </div>

      {/* Séance Section */}
      <Card title="The Séance" hint={`Incomplete groups: ${incomplete.length} · Changed: ${changed.length} · Sealed tables: ${sealedTables.length}`}>
        {incomplete.length === 0 && changed.length === 0 && sealedTables.length === 0 ? (
          <p className="text-sm text-neutral-500">All Séance categories are complete and active.</p>
        ) : (
          <div className="space-y-3">
            {incomplete.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Incomplete Categories</p>
                <div className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-neutral-50/50">
                  {incomplete.map(({ c, unknown }) => (
                    <div key={`i${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Link className="font-medium text-blue-700 hover:underline" href={`/admin/seance/${c.id}`}>{c.label}</Link>
                        <Pill tone="amber">{c.type}</Pill>
                        <Pill tone="slate">{c.status}</Pill>
                      </div>
                      <span className="text-xs text-neutral-600">
                        Unknown: <span className="text-neutral-900">{unknown.map((h) => heroName.get(h) ?? h).join(", ")}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {changed.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Sync Changed Categories</p>
                <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
                  {changed.map((c) => (
                    <div key={`c${c.id}`} className="flex items-center justify-between p-2.5 text-sm">
                      <Link className="font-medium text-blue-700 hover:underline" href={`/admin/seance/${c.id}`}>{c.label}</Link>
                      <Pill tone="red">{c.flagReason ?? "Flagged"}</Pill>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sealedTables.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Sealed Tables (Past 7 Days)</p>
                <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
                  {sealedTables.map((r) => (
                    <div key={`s${r.id}`} className="flex items-center justify-between p-2.5 text-sm">
                      <Link className="font-mono text-blue-700 hover:underline" href={`/admin/seance/preview?date=${r.date}&slug=${r.mode}`}>
                        {r.date} · {r.mode}
                      </Link>
                      <Pill tone="red">{r.sealedReason ?? "Sealed"}</Pill>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Flagged Heroes */}
      <Card title="Flagged Heroes" hint={`${flagged.length} heroes need review`}>
        {flagged.length === 0 ? (
          <p className="text-sm text-neutral-500">No heroes currently flagged for review.</p>
        ) : (
          <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
            {flagged.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3">
                  <Link className="font-medium text-blue-700 hover:underline" href={`/admin/heroes/${h.id}`}>{h.name}</Link>
                  <div className="flex flex-wrap gap-1">
                    {h.reviewReasons.map((r, i) => (
                      <Pill key={i} tone="amber">{r}</Pill>
                    ))}
                  </div>
                </div>
                <ActionButton action={markReviewed.bind(null, "hero", h.id)} label="Mark reviewed" />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Flagged Items & Abilities */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card
          title="Flagged Items"
          hint={`${items.length} items`}
          className="flex flex-col justify-between"
        >
          {items.length === 0 ? (
            <p className="text-sm text-neutral-500">No items flagged for review.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <ActionButton action={markAllReviewed.bind(null, "item")} label="Mark all reviewed" />
              </div>
              <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
                {items.map((i) => (
                  <div key={String(i.id)} className="flex items-center justify-between p-2.5 text-sm">
                    <span className="font-medium text-neutral-800">{i.name}</span>
                    <ActionButton action={markReviewed.bind(null, "item", Number(i.id))} label="Review" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Flagged Abilities"
          hint={`${abilities.length} abilities`}
          className="flex flex-col justify-between"
        >
          {abilities.length === 0 ? (
            <p className="text-sm text-neutral-500">No abilities flagged for review.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <ActionButton action={markAllReviewed.bind(null, "ability")} label="Mark all reviewed" />
              </div>
              <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
                {abilities.map((a) => (
                  <div key={String(a.id)} className="flex items-center justify-between p-2.5 text-sm">
                    <span className="font-medium text-neutral-800">{a.name}</span>
                    <ActionButton action={markReviewed.bind(null, "ability", Number(a.id))} label="Review" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Pending Texts */}
      <Card title="Pending Texts" hint="Live texts with automatic redaction requiring curator verification">
        {pendingTexts.length === 0 ? (
          <p className="text-sm text-neutral-500">All texts have been reviewed.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {pendingTexts.map((t) => (
              <Link
                key={`${t.entityType}-${t.status}-${t.stale}`}
                href={`/admin/texts?type=${t.entityType}&filter=${t.stale ? "stale" : "pending"}`}
                className="flex items-center justify-between rounded border border-neutral-200 p-3 transition hover:border-neutral-300 hover:bg-neutral-50"
              >
                <div>
                  <p className="font-medium text-neutral-800">{t.entityType}</p>
                  <p className="text-xs text-neutral-500">{t.stale ? "Stale rewrites" : "Auto-redacted"}</p>
                </div>
                <Pill tone={t.stale ? "red" : "amber"}>{t._count}</Pill>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Sound & Voice Backlogs */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Voice Lines Backlog (The Echo)" hint={`${fewLines.length} heroes with < ${ECHO_MIN_LINES} lines`}>
          {fewLines.length === 0 ? (
            <p className="text-sm text-neutral-500">All heroes meet voice line minimums.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {fewLines.map((h) => (
                <Link
                  key={h.id}
                  href={`/admin/heroes/${h.id}#voice`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700 hover:border-blue-300 hover:text-blue-700"
                >
                  <span>{h.name}</span>
                  <span className="font-mono text-neutral-400">({approvedLines.get(h.id) ?? 0})</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title="Sound Clips Backlog (The Resonance)" hint={`${soundBacklog.length} heroes have unpromoted clips`}>
          {soundBacklog.length === 0 ? (
            <p className="text-sm text-neutral-500">No pending sound clips.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {soundBacklog.map(({ h, n }) => (
                <Link
                  key={h.id}
                  href={`/admin/sounds?hero=${h.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700 hover:border-blue-300 hover:text-blue-700"
                >
                  <span>{h.name}</span>
                  <span className="font-mono text-neutral-400">({n})</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
