// Player reports (POST, open to everyone): a bug in one puzzle, or a wrong data value with an optional fix.
// Stored for review in /admin/feedback. Rate-limited per IP; a filled honeypot field is accepted and dropped.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/server";
import { LOCK_BY_SLUG } from "@/locks.config";
import { clientIp, tooMany } from "@/lib/server/ratelimit";
import { rateLimitShared } from "@/lib/server/sharedlimit";
import { todayDate } from "@/lib/day";

const headers = { "cache-control": "no-store" };
const text = (max: number) => z.string().trim().max(max);

const Report = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bug"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    lock: z.string().max(40),
    description: text(2000).min(5, "Describe what went wrong."),
    page: text(300).optional(),
    website: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("data"),
    entity: z.enum(["hero", "item", "ability"]),
    entityId: z.number().int().positive(),
    field: text(60).min(1),
    fieldLabel: text(80),
    currentValue: text(300).optional(),
    suggested: text(300).optional(),
    description: text(2000).optional(),
    page: text(300).optional(),
    website: z.string().max(200).optional(),
  }),
]);

async function entityName(entity: "hero" | "item" | "ability", id: number): Promise<string | null> {
  if (entity === "hero") return (await db.hero.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
  if (entity === "item") return (await db.item.findUnique({ where: { id: BigInt(id) }, select: { name: true } }))?.name ?? null;
  const a = await db.ability.findUnique({ where: { id: BigInt(id) }, select: { name: true, heroId: true } });
  if (!a) return null;
  const h = await db.hero.findUnique({ where: { id: a.heroId }, select: { name: true } });
  return h ? `${h.name}: ${a.name}` : a.name;
}

export async function POST(req: Request) {
  const parsed = Report.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400, headers });
  const limit = await rateLimitShared(`feedback:${clientIp(req)}`, 10, 60 * 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const r = parsed.data;
  if (r.website) return NextResponse.json({ ok: true }, { headers }); // bot
  const user = await currentUser().catch(() => null);

  if (r.kind === "bug") {
    if (!LOCK_BY_SLUG[r.lock]) return NextResponse.json({ error: "Pick the puzzle." }, { status: 400, headers });
    if (r.date && r.date > todayDate()) return NextResponse.json({ error: "That day hasn't happened yet." }, { status: 400, headers });
    await db.feedback.create({
      data: { kind: "bug", date: r.date, lock: r.lock, description: r.description, page: r.page || null, userId: user?.id ?? null },
    });
  } else {
    if (!r.suggested && !r.description) return NextResponse.json({ error: "Give the right value or describe what's wrong." }, { status: 400, headers });
    const name = await entityName(r.entity, r.entityId);
    if (!name) return NextResponse.json({ error: "That hero, item or ability doesn't exist." }, { status: 400, headers });
    await db.feedback.create({
      data: {
        kind: "data", entity: r.entity, entityId: r.entityId, entityName: name, field: r.field, fieldLabel: r.fieldLabel || r.field,
        currentValue: r.currentValue || null, suggested: r.suggested || null, description: r.description ?? "",
        page: r.page || null, userId: user?.id ?? null,
      },
    });
  }
  return NextResponse.json({ ok: true }, { headers });
}
