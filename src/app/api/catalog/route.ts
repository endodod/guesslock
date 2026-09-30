import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/engine/catalog";

export async function GET() {
  return NextResponse.json(await getCatalog(), { headers: { "cache-control": "public, max-age=300" } });
}
