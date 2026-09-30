// deadlock-api replay (demo) queries: submit SQL, poll the job, download the NDJSON artifact.
// ~1 min per job, rate-limited per hour (config.omenQueriesPerHour). See docs/omens-data-spike.md.
import { zstdDecompressSync } from "node:zlib";
import { config } from "../config";
import { apiHeaders } from "../deadlock/api";
import type { RawReplay } from "./ingest";

export type ReplayQueryName = "players" | "world" | "events";

const P = (f: string) => `"m_PlayerDataGlobal__${f}"`;
const G = (f: string) => `"m_pGameRules__${f}"`;

/** The three queries every Omen match needs. Column names are case-sensitive (DataFusion). */
export const REPLAY_QUERIES: Record<ReplayQueryName, string> = {
  // One row per player per second: exact net worth, HP, level, ultimate and respawn state.
  players: `SELECT tick, "m_steamID" AS steam, ${P("m_iGoldNetWorth")} AS nw, ${P("m_iHealth")} AS hp, ${P("m_iHealthMax")} AS maxhp,
    ${P("m_iLevel")} AS lvl, ${P("m_bUltimateTrained")} AS ult, ${P("m_flUltimateCooldownEnd")} AS ult_e, ${P("m_flRespawnTime")} AS respawn
    FROM CCitadelPlayerController WHERE tick % 64 = 0 AND "m_steamID" > 0 ORDER BY tick`,
  // Game-rules change rows: game start offset and the rift ("koth") state machine.
  world: `SELECT tick, ${G("m_flGameStartTime")} AS gst, ${G("m_nKothScoringTeam")} AS k_team,
    ${G("m_vecTeamKothStates__m_flCaptureProgressFrac")} AS k_prog, ${G("m_vecTeamKothStates__m_nCapturerCount")} AS k_cap
    FROM CCitadelGameRulesProxy ORDER BY tick`,
  // Midboss spawns (kills and rejuv claims come from the metadata).
  events: `SELECT 'mb_spawn' AS e, tick FROM MidBossSpawnedEvent ORDER BY tick`,
};

const API = () => `${config.apiBase}/v1/matches/demo/query`;

export type JobRef = { id: string; status: "queued" | "running" | "done" | "failed"; url?: string; error?: string };

export async function submitReplayQuery(matchId: number, name: ReplayQueryName): Promise<JobRef> {
  const res = await fetch(API(), {
    method: "POST",
    headers: apiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ match_id: matchId, query: REPLAY_QUERIES[name].replace(/\s+/g, " "), format: "ndjson" }),
    signal: AbortSignal.timeout(30000),
  });
  const body = (await res.json().catch(() => ({}))) as { job_id?: string; status?: string; error?: string };
  if (res.status === 404) throw Object.assign(new Error(body.error ?? "no replay available"), { noReplay: true });
  if (res.status === 429) throw Object.assign(new Error("replay query rate limit"), { rateLimited: true });
  if (!res.ok || !body.job_id) throw new Error(`replay query ${name}: HTTP ${res.status} ${body.error ?? ""}`.trim());
  return { id: body.job_id, status: "queued" };
}

export async function pollReplayQuery(job: JobRef): Promise<JobRef> {
  const res = await fetch(`${API()}/${job.id}`, { headers: apiHeaders(), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`replay job ${job.id}: HTTP ${res.status}`);
  const s = (await res.json()) as { status: JobRef["status"]; result_url?: string; error?: string };
  return { id: job.id, status: s.status, url: s.result_url, error: s.error };
}

export async function downloadRows<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { headers: { "user-agent": apiHeaders()["user-agent"] }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`replay artifact: HTTP ${res.status}`);
  let buf: Buffer = Buffer.from(await res.arrayBuffer());
  // Artifacts are zstd-compressed NDJSON (magic 28 b5 2f fd).
  if (buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd) buf = zstdDecompressSync(buf);
  return buf.toString("utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

/** Download all three results once every job is done. */
export async function collectReplay(jobs: Record<ReplayQueryName, JobRef>): Promise<RawReplay> {
  const [players, world, events] = await Promise.all([
    downloadRows<RawReplay["players"][number]>(jobs.players.url!),
    downloadRows<RawReplay["world"][number]>(jobs.world.url!),
    downloadRows<RawReplay["events"][number]>(jobs.events.url!),
  ]);
  return { players, world, events };
}
