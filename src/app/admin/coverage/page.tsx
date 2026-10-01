import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/auth";
import { loadGameData } from "@/lib/engine/context";
import { lockCoverage, THIN_POOL } from "@/lib/admin/coverage";
import { Card, PageHeader, Pill } from "../kit";

export const dynamic = "force-dynamic";

const TONE = { ok: "green", thin: "amber", empty: "red", sealed: "red" } as const;

export default async function CoveragePage() {
  await requireAdminPage();
  const rows = await lockCoverage(await loadGameData());
  const bad = rows.filter((r) => r.verdict !== "ok");
  return (
    <div className="space-y-6">
      <PageHeader title="Data coverage" subtitle={`Is there enough data for every lock? A pool under ${THIN_POOL} answers repeats quickly; an empty pool seals the lock.`} />
      <Card title={bad.length ? `${bad.length} ${bad.length === 1 ? "lock needs" : "locks need"} attention` : "Every lock has enough data"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-1 pr-3">Lock</th><th className="pr-3">Pool</th><th className="pr-3">No repeat</th><th className="pr-3">Days ahead</th><th className="pr-3">State</th><th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-t border-neutral-200 align-top">
                <td className="py-1.5 pr-3"><Link href={`/admin/puzzles/${r.slug}`} className="text-blue-700 hover:underline">{r.numeral} · {r.name}</Link></td>
                <td className="pr-3 font-mono">{r.pool ?? "—"}</td>
                <td className="pr-3 font-mono">{r.window === null ? "—" : `${r.window} d`}</td>
                <td className="pr-3 font-mono">{r.ahead.open} open{r.ahead.sealed ? ` · ${r.ahead.sealed} sealed` : ""}</td>
                <td className="pr-3"><Pill tone={TONE[r.verdict]}>{r.verdict}</Pill></td>
                <td className="text-neutral-600">{r.note}{r.ahead.reasons.length ? ` Sealed: ${r.ahead.reasons.join("; ")}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
