// Omen practice. GET ?omen&pool=top|random[&min&max][&seen=id,id] -> { id } (a random scenario);
// POST { id } -> snapshot; POST { id, answers } -> snapshot + reveal. Never counts toward souls.
import { NextResponse } from "next/server";
import { z } from "zod";
import { pickPractice, practiceScenario } from "@/lib/omens/practice";
import { omenView, parseAnswer } from "@/lib/omens/serve";

const Omen = z.enum(["clash", "beast", "rift"]);

export async function GET(req: Request) {
  const u = new URL(req.url);
  const omen = Omen.safeParse(u.searchParams.get("omen"));
  if (!omen.success) return NextResponse.json({ error: "bad omen" }, { status: 400 });
  const pool = u.searchParams.get("pool") === "top" ? "top" : "random";
  const min = Number(u.searchParams.get("min") ?? 0), max = Number(u.searchParams.get("max") ?? 999);
  const seen = (u.searchParams.get("seen") ?? "").split(",").filter(Boolean).slice(-500);
  const id = await pickPractice(omen.data, pool, seen, [min, max]);
  return NextResponse.json({ id }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = z.object({ id: z.string().max(80), answers: z.unknown().optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const payload = await practiceScenario(body.data.id);
  if (!payload) return NextResponse.json({ error: "not found" }, { status: 404 });
  const guess = body.data.answers === undefined ? null : parseAnswer(payload.omen, body.data.answers);
  if (body.data.answers !== undefined && !guess) return NextResponse.json({ error: "bad answers" }, { status: 400 });
  return NextResponse.json({ omen: payload.omen, ...omenView(payload, guess) }, { headers: { "cache-control": "no-store" } });
}
