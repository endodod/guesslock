import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { ECHO_MIN_LINES } from "@/lib/engine/modes/hero";
import { markAllReviewed, markReviewed } from "../actions";
import { ActionButton } from "../ui";

export default async function ReviewQueue() {
  await requireAdminPage();
  const [heroes, items, abilities, texts, voiceCounts, changedLines] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.item.findMany({ where: { needsReview: true }, orderBy: { name: "asc" } }),
    db.ability.findMany({ where: { needsReview: true }, orderBy: { name: "asc" } }),
    db.textEntry.groupBy({ by: ["entityType", "status", "stale"], _count: true }),
    db.voiceLine.groupBy({ by: ["heroId"], where: { status: { not: "excluded" } }, _count: true }),
    db.voiceLine.count({ where: { sourceChanged: true } }),
  ]);
  const flagged = heroes.filter((h) => h.needsReview);
  const approvedLines = new Map(voiceCounts.map((v) => [v.heroId, v._count]));
  const missingClassic = heroes.filter((h) => !h.species || !h.releaseDate);
  const missingEmoji = heroes.filter((h) => h.emojis.length < 10);
  const fewLines = heroes.filter((h) => !h.genericVoice && (approvedLines.get(h.id) ?? 0) < ECHO_MIN_LINES);
  const pendingTexts = texts.filter((t) => t.status === "auto" || t.stale);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Review queue</h1>

      <Box title={`Heroes flagged by sync (${flagged.length})`}>
        {flagged.map((h) => (
          <li key={h.id} className="flex items-center gap-3">
            <Link className="text-blue-700 hover:underline" href={`/admin/heroes/${h.id}`}>{h.name}</Link>
            <span className="text-xs text-neutral-600">{h.reviewReasons.join(" · ")}</span>
            <ActionButton action={markReviewed.bind(null, "hero", h.id)} label="Mark reviewed" />
          </li>
        ))}
      </Box>

      <Box title={`Texts not yet reviewed — already live with automatic redaction (${pendingTexts.reduce((a, t) => a + t._count, 0)})`}>
        {pendingTexts.map((t) => (
          <li key={`${t.entityType}-${t.status}-${t.stale}`}>
            <Link className="text-blue-700 hover:underline" href={`/admin/texts?type=${t.entityType}&filter=${t.stale ? "stale" : "pending"}`}>
              {t.entityType}
            </Link>{" "}
            {t.stale ? "stale rewrites" : "auto-redacted, not reviewed"}: {t._count}
          </li>
        ))}
      </Box>

      <Box title={`Missing species or release date — The Reckoning (${missingClassic.length})`}>
        <li className="flex flex-wrap gap-x-3">
          {missingClassic.map((h) => <Link key={h.id} className="text-blue-700 hover:underline" href={`/admin/heroes/${h.id}`}>{h.name}</Link>)}
        </li>
      </Box>

      <Box title={`Missing a complete emoji set — The Cipher (${missingEmoji.length})`}>
        <li className="flex flex-wrap gap-x-3">
          {missingEmoji.map((h) => <Link key={h.id} className="text-blue-700 hover:underline" href={`/admin/heroes/${h.id}#emoji`}>{h.name}</Link>)}
        </li>
      </Box>

      <Box title={`Fewer than ${ECHO_MIN_LINES} usable voice lines — The Echo (${fewLines.length}); changed wiki lines: ${changedLines}`}>
        <li className="flex flex-wrap gap-x-3">
          {fewLines.map((h) => (
            <Link key={h.id} className="text-blue-700 hover:underline" href={`/admin/heroes/${h.id}#voice`}>
              {h.name} ({approvedLines.get(h.id) ?? 0})
            </Link>
          ))}
        </li>
      </Box>

      <Box title={`Items flagged by sync (${items.length})`} action={items.length ? <ActionButton action={markAllReviewed.bind(null, "item")} label="Mark all reviewed" /> : null}>
        {items.map((i) => (
          <li key={String(i.id)} className="flex items-center gap-3">
            <span>{i.name}</span>
            <span className="text-xs text-neutral-600">{i.reviewReasons.join(" · ")}</span>
            <ActionButton action={markReviewed.bind(null, "item", Number(i.id))} label="Mark reviewed" />
          </li>
        ))}
      </Box>

      <Box title={`Abilities flagged by sync (${abilities.length})`} action={abilities.length ? <ActionButton action={markAllReviewed.bind(null, "ability")} label="Mark all reviewed" /> : null}>
        {abilities.map((a) => (
          <li key={String(a.id)} className="flex items-center gap-3">
            <span>{a.name}</span>
            <span className="text-xs text-neutral-600">{a.reviewReasons.join(" · ")}</span>
            <ActionButton action={markReviewed.bind(null, "ability", Number(a.id))} label="Mark reviewed" />
          </li>
        ))}
      </Box>
    </div>
  );
}

function Box({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded border border-neutral-300 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <ul className="space-y-1 text-sm">{children}</ul>
    </section>
  );
}
