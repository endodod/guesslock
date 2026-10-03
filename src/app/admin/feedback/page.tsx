import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { LOCK_BY_SLUG } from "@/locks.config";
import { Card, PageHeader, Pill, Stat } from "../kit";
import { ActionButton } from "../ui";
import { applyFeedbackFix, saveFeedbackNote, setFeedbackStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_TONE = { open: "amber", fixed: "green", dismissed: "slate" } as const;

export default async function FeedbackAdmin({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = ["open", "fixed", "dismissed", "all"].includes(sp.status ?? "") ? sp.status! : "open";
  const kind = sp.kind === "bug" || sp.kind === "data" ? sp.kind : undefined;
  let rows, counts;
  try {
    [rows, counts] = await Promise.all([
      db.feedback.findMany({ where: { ...(status === "all" ? {} : { status }), ...(kind ? { kind } : {}) }, orderBy: { createdAt: "desc" }, take: 200 }),
      db.feedback.groupBy({ by: ["status"], _count: true }),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code !== "P2021") throw e;
    return (
      <div className="space-y-6">
        <PageHeader title="Feedback" />
        <p role="alert" className="rounded border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This database has no feedback table yet (a migration is pending). Run <code>npx prisma migrate deploy</code> against it, or deploy, to create it.
        </p>
      </div>
    );
  }
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const abilityHero = new Map(
    (await db.ability.findMany({ where: { id: { in: rows.filter((r) => r.entity === "ability" && r.entityId !== null).map((r) => BigInt(r.entityId!)) } }, select: { id: true, heroId: true } }))
      .map((a) => [Number(a.id), a.heroId]),
  );
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ status, kind, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/feedback?${q}`;
  };
  const tab = (on: boolean) => `rounded-md px-3 py-1.5 ${on ? "bg-white font-semibold shadow-sm" : "text-neutral-600 hover:text-neutral-900"}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Feedback" subtitle={<>Reports from players on <Link href="/feedback" className="text-blue-700 hover:underline">/feedback</Link>: broken puzzles and wrong values.</>} />
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Open" value={count("open")} tone={count("open") ? "amber" : "green"} />
        <Stat label="Fixed" value={count("fixed")} tone="green" />
        <Stat label="Dismissed" value={count("dismissed")} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
          {["open", "fixed", "dismissed", "all"].map((s) => <Link key={s} href={href({ status: s })} className={tab(status === s)}>{s}</Link>)}
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
          {[[undefined, "all kinds"], ["bug", "puzzle bugs"], ["data", "wrong values"]].map(([k, l]) => <Link key={l} href={href({ kind: k })} className={tab(kind === k)}>{l}</Link>)}
        </div>
      </div>

      {rows.length === 0 && <Card><p className="text-sm text-neutral-500">No reports here.</p></Card>}
      {rows.map((f) => {
        const lock = f.lock ? LOCK_BY_SLUG[f.lock] : undefined;
        const heroId = f.entity === "hero" ? f.entityId : f.entity === "ability" && f.entityId !== null ? abilityHero.get(f.entityId) : undefined;
        const isCategory = f.kind === "data" && (f.entity === "hero" || f.entity === "item") && f.field && f.field !== "other" && f.field !== "name" && f.field !== "lore" && f.field !== "description";
        return (
          <Card key={f.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={STATUS_TONE[f.status as keyof typeof STATUS_TONE] ?? "slate"}>{f.status}</Pill>
                  <Pill tone={f.kind === "bug" ? "red" : "indigo"}>{f.kind === "bug" ? "puzzle bug" : "wrong value"}</Pill>
                  <span className="text-xs text-neutral-500">#{f.id} · {f.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC{f.userId ? " · signed in" : ""}</span>
                </p>
                {f.kind === "bug" ? (
                  <p className="font-semibold">
                    {lock ? `${lock.numeral}. ${lock.name}` : f.lock} <span className="font-normal text-neutral-500">· {f.date ?? "no day"}</span>
                  </p>
                ) : (
                  <p className="font-semibold">
                    {f.entityName} <span className="font-normal text-neutral-500">· {f.fieldLabel}</span>
                  </p>
                )}
                {f.kind === "data" && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                    <dt className="text-neutral-500">Shown</dt><dd>{f.currentValue || "—"}</dd>
                    <dt className="text-neutral-500">Should be</dt><dd className="font-medium">{f.suggested || "—"}</dd>
                  </dl>
                )}
                {f.description && <p className="whitespace-pre-wrap text-sm text-neutral-800">{f.description}</p>}
                <p className="flex flex-wrap gap-3 text-xs">
                  {f.kind === "bug" && f.lock && f.date && <Link href={`/lock/${f.lock}?d=${f.date}`} className="text-blue-700 hover:underline">Open the puzzle</Link>}
                  {f.kind === "bug" && lock && <Link href={`/admin/puzzles/${lock.hardOf ?? lock.slug}`} className="text-blue-700 hover:underline">Lock admin</Link>}
                  {heroId !== undefined && heroId !== null && <Link href={`/admin/heroes/${heroId}#attributes`} className="text-blue-700 hover:underline">Hero page</Link>}
                  {isCategory && <Link href={`/admin/categories/${encodeURIComponent(f.field!)}?entity=${f.entity}`} className="text-blue-700 hover:underline">This category for all</Link>}
                  {f.entity === "item" && <Link href={`/admin/categories?entity=item#values`} className="text-blue-700 hover:underline">Item data grid</Link>}
                  {f.page && <span className="text-neutral-500">from {f.page}</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {f.status === "open" && isCategory && f.suggested && (
                  <ActionButton label="Apply fix" confirm={`Set ${f.fieldLabel} of ${f.entityName} to "${f.suggested}"?`} action={applyFeedbackFix.bind(null, f.id)} />
                )}
                {f.status !== "fixed" && <ActionButton label="Mark fixed" action={setFeedbackStatus.bind(null, f.id, "fixed")} />}
                {f.status !== "dismissed" && <ActionButton label="Dismiss" action={setFeedbackStatus.bind(null, f.id, "dismissed")} />}
                {f.status !== "open" && <ActionButton label="Reopen" action={setFeedbackStatus.bind(null, f.id, "open")} />}
              </div>
            </div>
            <form action={saveFeedbackNote.bind(null, f.id)} className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
              <input name="note" defaultValue={f.adminNote ?? ""} placeholder="Note (only admins see it)" className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" />
              <button className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50">Save note</button>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
