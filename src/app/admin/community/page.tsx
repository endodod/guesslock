import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { Card, PageHeader, Pill, Stat } from "../kit";
import { ActionButton } from "../ui";
import { setPuzzleStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommunityAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = sp.status === "live" || sp.status === "all" ? sp.status : "hidden";
  const [rows, counts] = await Promise.all([
    db.communityPuzzle.findMany({
      where: status === "all" ? {} : status === "hidden" ? { OR: [{ status: "hidden" }, { reports: { gt: 0 } }] } : { status: "live" },
      orderBy: [{ reports: "desc" }, { createdAt: "desc" }], take: 200,
    }),
    db.communityPuzzle.groupBy({ by: ["status"], _count: true }),
  ]);
  const [reports, authors] = await Promise.all([
    db.communityReport.findMany({ where: { puzzleId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: "desc" } }),
    db.profile.findMany({ where: { userId: { in: rows.map((r) => r.authorId) } }, select: { userId: true, displayName: true } }),
  ]);
  const author = new Map(authors.map((a) => [a.userId, a.displayName]));
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const tab = (on: boolean) => `rounded-md px-3 py-1.5 ${on ? "bg-white font-semibold shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Community puzzles" subtitle={<>Player-made puzzles on <Link href="/community" className="text-blue-700 hover:underline">/community</Link>. Three reports hide a puzzle until you look at it.</>} />
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Live" value={count("live")} tone="green" />
        <Stat label="Hidden" value={count("hidden")} tone={count("hidden") ? "amber" : "green"} />
      </div>
      <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs">
        {[["hidden", "hidden or reported"], ["live", "live"], ["all", "all"]].map(([s, l]) => <Link key={s} href={`/admin/community?status=${s}`} className={tab(status === s)}>{l}</Link>)}
      </div>
      {rows.length === 0 ? <p className="text-sm text-neutral-600">Nothing here.</p> : rows.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                <Link href={`/community/${r.id}`} className="text-blue-700 hover:underline">{r.title}</Link>{" "}
                <Pill tone={r.status === "live" ? "green" : "amber"}>{r.status}</Pill>{" "}
                {r.reports > 0 && <Pill tone="red">{r.reports} {r.reports === 1 ? "report" : "reports"}</Pill>}
              </p>
              <p className="text-xs text-neutral-600">
                {r.kind === "seance" ? `Sorting table (${r.entity})` : "Constellation"} · by {author.get(r.authorId) ?? r.authorId} · {r.plays} plays · {r.createdAt.toISOString().slice(0, 10)}
              </p>
            </div>
            <ActionButton action={setPuzzleStatus.bind(null, r.id, r.status === "live" ? "hidden" : "live")} label={r.status === "live" ? "Hide" : "Restore"} />
          </div>
          {reports.some((x) => x.puzzleId === r.id) && (
            <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
              {reports.filter((x) => x.puzzleId === r.id).map((x) => <li key={x.userId}>{x.reason || <span className="text-neutral-400">no reason given</span>}</li>)}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
