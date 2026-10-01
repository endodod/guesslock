import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { getCatalog } from "@/lib/engine/catalog";
import { getMapMeta } from "@/lib/omens/map";
import { unpackTimeline } from "@/lib/omens/harvest";
import { toMap } from "@/lib/omens/ingest";
import type { OmenPayload } from "@/lib/omens/types";
import { OmenInspector } from "./OmenInspector";
import { Card, PageHeader, Pill, Stat } from "../../kit";

export const dynamic = "force-dynamic";

export default async function ScenarioInspector({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const s = await db.scenario.findUnique({ where: { id }, include: { match: { select: { timelineGz: true, status: true } } } });
  if (!s) notFound();
  const payload = s.payload as unknown as OmenPayload;
  // The 10 s before T come from the stored match timeline (kept OMEN_TIMELINE_DAYS days).
  let before: { pos: [number, number][]; hp: number[]; maxHp: number[] }[] | null = null;
  if (s.match.timelineGz) {
    const tl = unpackTimeline(s.match.timelineGz);
    before = tl.players.map((p) => {
      const secs = Array.from({ length: 10 }, (_, i) => s.t - 10 + i);
      return { pos: secs.map((t) => toMap(p.x[t], p.y[t])), hp: secs.map((t) => p.hp[t]), maxHp: secs.map((t) => p.maxHp[t]) };
    });
  }
  const [catalog, map] = await Promise.all([getCatalog(), getMapMeta()]);
  const icons = Object.fromEntries(catalog.hero.map((h) => [Number(h.id), { name: h.name, icon: h.icon }]));
  return (
    <div className="space-y-6">
      <PageHeader title={s.id} subtitle={s.omen} actions={<Link className="text-sm text-blue-700 hover:underline" href="/admin/omens">← The Omens</Link>} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Outcome" value={<Pill tone={s.positive ? "green" : "slate"}>{s.positive ? "positive" : "negative"}</Pill>} />
        <Stat label="Quality" value={s.quality.toFixed(2)} />
        <Stat label="Rank" value={s.rank} />
        <Stat label="Status" value={<Pill tone={s.status === "approved" ? "green" : s.status === "rejected" ? "red" : "amber"}>{s.status}</Pill>} />
      </div>
      <Card className="text-sm text-neutral-600">{s.dailyDate && `daily ${s.dailyDate} · `}match {String(s.matchId)} ({s.match.status})</Card>
      <OmenInspector payload={payload} before={before} heroes={icons} map={map} />
    </div>
  );
}
