"use client";
// Omen practice: pick an Omen and a source (top players, random, or your own matches), play, repeat.
import { useCallback, useEffect, useState } from "react";
import type { OmenAnswer, OmenKind } from "@/lib/omens/types";
import type { OmenView } from "@/lib/omens/serve";
import type { OmenMapMeta } from "@/lib/omens/map";
import type { MyMatch } from "@/lib/omens/practice";
import { useGame } from "../GameProvider";
import { Button, DecoFrame, KeyholeLoader } from "../ui";
import { OmenGame, clock } from "./OmenGame";
import type { OmenCatalog } from "./OmenPanels";

type Source = "top" | "random" | "mine";
const OMEN_NAMES: Record<OmenKind, string> = { clash: "The Clash", beast: "The Beast", rift: "The Rift" };
const SEEN_KEY = "guesslock:omen-seen";

const loadSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; }
};
const saveSeen = (ids: string[]) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-500))); } catch { /* storage blocked */ }
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export function PracticeClient({ cat, map, counts }: { cat: OmenCatalog; map: OmenMapMeta; counts: Record<OmenKind, { top: number; all: number }> }) {
  const { addPractice, toast } = useGame();
  const [omen, setOmen] = useState<OmenKind>("clash");
  const [source, setSource] = useState<Source>("top");
  const [rank, setRank] = useState<[number, number]>([0, 120]);
  const [current, setCurrent] = useState<{ id: string; view: OmenView; myKey: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [round, setRound] = useState(0);

  const load = useCallback(async (id: string, myKey: number | null = null) => {
    setLoading(true);
    try {
      const view = await post<OmenView>("/api/omen/practice", { id });
      setCurrent({ id, view, myKey });
      setRound((r) => r + 1);
      saveSeen([...loadSeen(), id]);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const next = useCallback(async (o: OmenKind = omen, src: Source = source, r: [number, number] = rank) => {
    if (src === "mine") { setCurrent(null); return; }
    setEmpty(false);
    setLoading(true);
    const q = new URLSearchParams({ omen: o, pool: src === "top" ? "top" : "random", min: String(r[0]), max: String(r[1]), seen: loadSeen().join(",") });
    try {
      const { id } = (await (await fetch(`/api/omen/practice?${q}`)).json()) as { id: string | null };
      if (!id) { setCurrent(null); setEmpty(true); return; }
      await load(id);
    } finally {
      setLoading(false);
    }
  }, [omen, source, rank, load]);

  // First scenario after mount (deferred so no state is set synchronously in the effect).
  useEffect(() => {
    void Promise.resolve().then(() => next());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pickOmen = (o: OmenKind) => { setOmen(o); void next(o, source, rank); };
  const pickSource = (s: Source) => { setSource(s); void next(omen, s, rank); };
  const pickRank = (r: [number, number]) => { setRank(r); void next(omen, source, r); };

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Omen" className="flex overflow-hidden rounded-[3px] border border-cursed/50">
          {(["clash", "beast", "rift"] as OmenKind[]).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={omen === o} onClick={() => pickOmen(o)} className={`min-h-11 px-4 ${omen === o ? "bg-cursed/25 text-paper" : "text-ash hover:text-paper"}`}>
              {OMEN_NAMES[o]}
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Source" className="flex overflow-hidden rounded-[3px] border border-brass/40">
          {([["top", "Top players"], ["random", "Random"], ["mine", "My matches"]] as [Source, string][]).map(([s, label]) => (
            <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => pickSource(s)} className={`min-h-11 px-4 ${source === s ? "bg-brass/20 text-paper" : "text-ash hover:text-paper"}`}>
              {label}
            </button>
          ))}
        </div>
        {source === "random" && (
          <label className="flex items-center gap-2 text-sm text-ash">
            Rank
            <select value={rank.join("-")} onChange={(e) => pickRank(e.target.value.split("-").map(Number) as [number, number])} className="min-h-11 rounded-[3px] border border-brass/40 bg-ink px-2 text-paper">
              <option value="0-120">Any</option>
              <option value="100-120">Eternus and up (100+)</option>
              <option value="70-99">Emissary to Phantom (70–99)</option>
              <option value="0-69">Below Emissary</option>
            </select>
          </label>
        )}
        {source !== "mine" && (
          <span className="text-xs text-ash">{source === "top" ? counts[omen].top : counts[omen].all} scenarios in the pool</span>
        )}
      </div>

      {source === "mine" && <MyMatches omen={omen} onPlay={(id, key) => load(id, key)} />}

      {loading && <KeyholeLoader />}
      {empty && !loading && (
        <DecoFrame className="p-6 text-center" corners={false}>
          <p className="text-paper">No new {OMEN_NAMES[omen]} scenarios here yet.</p>
          <p className="mt-1 text-sm text-ash">New matches are harvested twice a day. Try another source or rank range.</p>
        </DecoFrame>
      )}

      {current && !loading && (
        <OmenGame
          key={`${current.id}-${round}`}
          omen={current.view.snapshot.omen}
          initial={current.view}
          cat={cat}
          map={map}
          myKey={current.myKey}
          submit={(answers: OmenAnswer) => post<OmenView>("/api/omen/practice", { id: current.id, answers })}
          onLocked={(v) => addPractice(current.view.snapshot.omen, v.reveal!.result.total)}
          footer={() => source !== "mine" ? <Button onClick={() => void next()}>Next scenario</Button> : null}
        />
      )}
    </div>
  );
}

function MyMatches({ omen, onPlay }: { omen: OmenKind; onPlay: (id: string, myKey: number | null) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<MyMatch[] | null>(null);

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ matches: MyMatch[] }>("/api/omen/mine", { account: input });
      setMatches(r.matches);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label: Record<MyMatch["status"], string> = {
    ready: "Ready", queued: "Queued: ready after the next harvest (within about 12 hours)", "no-replay": "No replay available",
    failed: "Couldn't be processed", limit: "Daily request limit reached, try tomorrow",
  };

  return (
    <DecoFrame className="space-y-4 p-4 md:p-5" corners={false}>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
        <label className="sr-only" htmlFor="omen-account">Steam profile or account ID</label>
        <div className="search-field flex min-h-12 min-w-64 flex-1 items-center rounded-[3px] border border-brass/50 bg-ink/80 px-3">
          <input id="omen-account" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Steam profile URL, SteamID64 or account ID" className="min-w-0 flex-1 bg-transparent py-2 text-paper outline-none placeholder:text-ash" />
        </div>
        <Button type="submit" disabled={busy || !input.trim()}>{busy ? "Looking…" : "Find my matches"}</Button>
      </form>
      <p className="text-sm text-ash">
        Omens need the match replay, which only some matches have. Recent matches can take 1–2 days to show up, and some are never indexed.
        The <a className="text-brass underline" href="https://deadlock-api.com" target="_blank" rel="noreferrer">deadlock-api</a> ingest tool submits your own matches automatically.
        Your hero is highlighted; player names stay hidden.
      </p>
      {error && <p className="text-sm text-[#e6a3a0]">{error}</p>}
      {matches && (
        <ul className="divide-y divide-brass/10">
          {matches.length === 0 && <li className="py-2 text-ash">No recent matches found.</li>}
          {matches.map((m) => {
            const mine = m.scenarios.filter((s) => s.omen === omen);
            return (
              <li key={m.matchId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-paper">
                  {new Date(m.startTime * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · match {m.matchId}
                </span>
                {m.status === "ready" && mine.length ? (
                  <span className="flex flex-wrap gap-1">
                    {mine.map((s, i) => (
                      <Button key={s.id} variant="ghost" onClick={() => onPlay(s.id, s.myKey)}>Play #{i + 1} ({clock(Number(s.id.split("-").at(-1)))})</Button>
                    ))}
                  </span>
                ) : (
                  <span className="text-ash">{m.status === "ready" ? `No ${OMEN_NAMES[omen]} moments in this match` : label[m.status]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DecoFrame>
  );
}
