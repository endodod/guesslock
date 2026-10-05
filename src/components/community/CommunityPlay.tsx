"use client";
// Plays a community puzzle: a sorting table (the Séance board) or a Constellation grid. Like Endless, the device keeps
// its entries and the server replays them; nothing here is worth souls.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CatalogEntry, PlayView } from "@/lib/engine/types";
import type { CommunityView } from "@/lib/community/service";
import { loadCommunityEntries, saveCommunityEntries } from "@/lib/client/community";
import { t } from "@/lib/i18n/en";
import { useGame } from "../GameProvider";
import { ConstellationStage } from "../BoardStages";
import { SeanceTable } from "../seance/SeanceLock";
import { Button, DecoFrame, Icon, KeyholeLoader, LockpickRow } from "../ui";

type Props = {
  id: string;
  initial: CommunityView;
  /** What the tiles are called ("heroes", "items", "abilities"). */
  noun: string;
  heroes: CatalogEntry[];
  rules: string;
  signedIn: boolean;
  isAuthor: boolean;
};

async function post(body: unknown): Promise<Response> {
  return fetch("/api/community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function CommunityPlay({ id, initial, noun, heroes, rules, signedIn, isAuthor }: Props) {
  const { hydrated, toast, play } = useGame();
  const [view, setView] = useState<CommunityView>(initial);
  const [entries, setEntries] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const restored = useRef(false);

  const run = useCallback(async (next: string[]): Promise<CommunityView | null> => {
    const res = await post({ action: "play", id, entries: next });
    if (!res.ok) { toast(t.lock.error); return null; }
    const v = (await res.json()) as CommunityView;
    setView(v);
    setEntries(next);
    saveCommunityEntries(id, next);
    return v;
  }, [id, toast]);

  useEffect(() => {
    if (!hydrated || restored.current) return;
    restored.current = true;
    const saved = loadCommunityEntries(id);
    void Promise.resolve().then(() => (saved.length ? run(saved) : null)).finally(() => setRestoring(false));
  }, [hydrated, id, run]);

  if (!hydrated) return <KeyholeLoader />;

  const done = view.view.status === "won" || view.view.status === "lost";
  const more = (
    <Link href="/community" className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-ecto/60 bg-ecto/10 px-4 text-ecto hover:bg-ecto/20">
      More community puzzles <Icon name="arrow-right" className="h-4 w-4" />
    </Link>
  );

  return (
    <div className="space-y-5 pb-32 md:pb-10">
      <p className="text-center text-xs text-ash">Community puzzle: made by a player, not worth souls.</p>
      {view.kind === "seance" ? (
        <SeanceTable
          view={view.view}
          restoring={restoring}
          rules={rules}
          showRules={showRules}
          setShowRules={setShowRules}
          noun={noun}
          contain={noun !== "heroes"}
          noSouls
          onSubmit={async (entry) => {
            const v = await run([...entries, entry]);
            return v?.kind === "seance" ? v.view : null;
          }}
          onSound={play}
          footer={() => more}
        />
      ) : (
        <GridPlay
          view={view.view} heroes={heroes} busy={busy || restoring} rules={rules}
          onGuess={async (g) => {
            const before = view.view as PlayView;
            setBusy(true);
            try {
              const v = await run([...entries, g]);
              if (!v || v.kind !== "constellation") return false;
              const pv = v.view;
              if (pv.notice && pv.rows.length === before.rows.length) { toast(pv.notice); return false; }
              play(pv.wrong > before.wrong ? "tick" : "click");
              return pv.status === "won";
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {done && view.kind === "constellation" && (
        <DecoFrame className="space-y-3 p-5 text-center" corners={false}>
          <p className={`font-display text-2xl ${view.view.status === "won" ? "text-ecto" : "text-[#d08a8a]"}`}>{view.view.status === "won" ? "The sky is full." : "The stars go dark."}</p>
          <div className="flex justify-center">{more}</div>
        </DecoFrame>
      )}
      <Report id={id} signedIn={signedIn} isAuthor={isAuthor} />
    </div>
  );
}

function GridPlay({ view, heroes, busy, rules, onGuess }: { view: PlayView; heroes: CatalogEntry[]; busy: boolean; rules: string; onGuess: (g: string) => Promise<boolean> }) {
  const [showRules, setShowRules] = useState(false);
  const done = view.status === "won" || view.status === "lost";
  if (view.clue?.kind !== "constellation") return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <LockpickRow total={4} broken={view.wrong} glowing={view.status === "won"} triesLeft={Math.max(0, 4 - view.wrong)} />
        <button type="button" onClick={() => setShowRules((s) => !s)} aria-expanded={showRules} className="flex h-11 w-11 items-center justify-center text-brass" aria-label={t.lock.rules}>
          <Icon name="question" className="h-6 w-6" />
        </button>
      </div>
      {showRules && <DecoFrame className="p-4 text-sm leading-relaxed text-paper/90" corners={false}><p>{rules}</p></DecoFrame>}
      <ConstellationStage clue={view.clue} entries={heroes} onGuess={onGuess} busy={busy} done={done} />
    </div>
  );
}

function Report({ id, signedIn, isAuthor }: { id: string; signedIn: boolean; isAuthor: boolean }) {
  const { toast } = useGame();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  if (isAuthor) {
    return (
      <p className="text-center text-xs">
        <button
          type="button" className="min-h-11 text-ash underline-offset-4 hover:text-[#e6a3a0] hover:underline"
          onClick={async () => {
            if (!window.confirm("Delete this puzzle for everyone?")) return;
            const res = await post({ action: "delete", id });
            if (res.ok) router.push("/community");
            else toast("Could not delete it. Try again.");
          }}
        >
          Delete my puzzle
        </button>
      </p>
    );
  }
  if (!signedIn) return <p className="text-center text-xs text-ash"><Link href={`/auth/sign-in?next=/community/${id}`} className="underline-offset-4 hover:underline">Sign in</Link> to report a puzzle.</p>;
  if (sent) return <p className="text-center text-xs text-ash">Thanks, the puzzle was reported.</p>;
  if (!open) {
    return (
      <p className="text-center text-xs">
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-ash underline-offset-4 hover:text-paper hover:underline">Report this puzzle</button>
      </p>
    );
  }
  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await post({ action: "report", id, reason });
        if (res.ok) setSent(true);
        else toast((await res.json().catch(() => null))?.error ?? "Could not send the report.");
      }}
    >
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="What's wrong with it? (optional)" className="rounded-[3px] border border-brass/40 bg-ink/80 p-2 text-sm text-paper" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="cursed" type="submit">Report</Button>
      </div>
    </form>
  );
}
