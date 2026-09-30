import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { getCatalog } from "@/lib/engine/catalog";
import { getMapMeta } from "@/lib/omens/map";
import { unpackTimeline } from "@/lib/omens/harvest";
import { toMap } from "@/lib/omens/ingest";
import type { OmenPayload } from "@/lib/omens/types";
import { OmenInspector } from "./OmenInspector";

export const dynamic = "force-dynamic";

export default async function ScenarioInspector({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
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
    <div>
      <p className="mb-2 text-sm"><Link className="text-blue-700 hover:underline" href="/admin/omens">← The Omens</Link></p>
      <h1 className="text-2xl font-semibold">{s.id}</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {s.omen} · {s.positive ? "positive" : "negative"} · quality {s.quality.toFixed(2)} · rank {s.rank} · status {s.status}
        {s.dailyDate && ` · daily ${s.dailyDate}`} · match {String(s.matchId)} ({s.match.status})
      </p>
      <OmenInspector payload={payload} before={before} heroes={icons} map={map} />
    </div>
  );
}
