"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveSound, setSound } from "./actions";

export type ClipRowData = {
  id: number; name: string; folder: string; url: string; kind: "ability" | "weapon"; role: string; status: string;
  abilityId: number | null; score: number; preferred: boolean; reason: string | null; changed: boolean; missing: boolean;
  manual: boolean; durationMs: number | null; loudnessDb: number | null; gainDb: number | null; mirrored: boolean;
};

const ROLES = ["cast", "impact", "loop", "other"];

/** Admin preview straight from the source URL (admins may see codenames), at the stored gain. */
function Play({ url, gainDb }: { url: string; gainDb: number | null }) {
  const [el, setEl] = useState<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className="w-12 rounded border border-neutral-400 px-1 text-xs"
      onClick={() => {
        let a = el;
        if (!a) {
          a = new Audio(url);
          // Preview roughly at the normalized level (HTMLAudio can't boost above 1).
          a.volume = Math.min(1, Math.pow(10, (gainDb ?? 0) / 20));
          a.onended = () => setOn(false);
          setEl(a);
        }
        if (on) { a.pause(); a.currentTime = 0; setOn(false); } else { void a.play(); setOn(true); }
      }}
    >
      {on ? "■ stop" : "▶ play"}
    </button>
  );
}

function Row({ r: initial, abilities }: { r: ClipRowData; abilities: { id: number; name: string }[] }) {
  const [r, setR] = useState(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<void>, next: Partial<ClipRowData>, refresh = false) =>
    start(async () => {
      setErr(null);
      try {
        await fn();
        setR((x) => ({ ...x, ...next, manual: true }));
        if (refresh) router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  const color = r.status === "approved" ? "bg-green-50" : r.status === "excluded" ? "bg-neutral-50 text-neutral-500" : "";
  return (
    <tr className={`border-t border-neutral-200 align-top ${color} ${pending ? "opacity-50" : ""}`}>
      <td className="py-1"><Play url={r.url} gainDb={r.gainDb} /></td>
      <td className="max-w-[22rem] break-all py-1 font-mono text-xs" title={`${r.folder}/${r.name}`}>
        {r.name}
        <div className="font-sans text-[0.7rem] text-neutral-500">
          {r.folder} · score {r.score}
          {r.reason && <span className="ml-1 text-amber-700">{r.reason}</span>}
          {r.changed && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">source changed</span>}
          {r.missing && <span className="ml-1 rounded bg-red-100 px-1 text-red-800">gone from index</span>}
        </div>
      </td>
      <td className="py-1">
        <select value={r.role} disabled={pending} onChange={(e) => run(() => setSound(r.id, { role: e.target.value }), { role: e.target.value })} className="rounded border border-neutral-300 text-xs">
          {ROLES.map((x) => <option key={x}>{x}</option>)}
        </select>
      </td>
      {r.kind === "ability" && (
        <td className="py-1">
          <select
            value={r.abilityId ?? ""}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              run(() => setSound(r.id, { abilityId: v }), { abilityId: v }, true);
            }}
            className="max-w-36 rounded border border-neutral-300 text-xs"
          >
            <option value="">(none)</option>
            {abilities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </td>
      )}
      <td className="whitespace-nowrap py-1 font-mono text-xs">
        {r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(1)} s` : "–"}
        <div className="text-neutral-500">{r.gainDb !== null ? `${r.gainDb > 0 ? "+" : ""}${r.gainDb} dB` : "unmeasured"}</div>
      </td>
      <td className="py-1">
        <button
          type="button"
          title="Prefer as clip 1 (cast) / as the gun clip"
          disabled={pending}
          onClick={() => run(() => setSound(r.id, { preferred: !r.preferred }), { preferred: !r.preferred }, true)}
          className={r.preferred ? "text-amber-500" : "text-neutral-300"}
        >
          ★
        </button>
      </td>
      <td className="whitespace-nowrap py-1 text-xs">
        <span className={r.status === "approved" ? "text-green-700" : r.status === "excluded" ? "" : "text-amber-700"}>{r.status}</span>
        <div className="mt-0.5 flex gap-1">
          {(r.status !== "approved" || r.changed) && (
            <button
              type="button"
              disabled={pending || (r.kind === "ability" && r.abilityId === null)}
              onClick={() => run(() => approveSound(r.id), { status: "approved", changed: false, mirrored: true }, true)}
              className="rounded bg-neutral-900 px-1.5 text-white disabled:opacity-40"
            >
              approve
            </button>
          )}
          {r.status !== "excluded" && (
            <button type="button" disabled={pending} onClick={() => run(() => setSound(r.id, { status: "excluded" }), { status: "excluded" }, true)} className="rounded border border-neutral-400 px-1.5">
              exclude
            </button>
          )}
          {r.status === "excluded" && (
            <button type="button" disabled={pending} onClick={() => run(() => setSound(r.id, { status: "suggested" }), { status: "suggested", reason: null }, true)} className="rounded border border-neutral-400 px-1.5">
              restore
            </button>
          )}
        </div>
        {err && <div className="text-red-700">{err}</div>}
      </td>
    </tr>
  );
}

export function ClipTable({ rows, abilities }: { rows: ClipRowData[]; abilities: { id: number; name: string }[] }) {
  if (!rows.length) return <p className="text-sm text-neutral-500">Nothing here.</p>;
  const weapon = rows[0].kind === "weapon";
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-left text-xs text-neutral-500">
          <tr><th></th><th>Clip</th><th>Role</th>{!weapon && <th>Ability</th>}<th>Length / gain</th><th>★</th><th>Status</th></tr>
        </thead>
        <tbody>{rows.map((r) => <Row key={r.id} r={r} abilities={abilities} />)}</tbody>
      </table>
    </div>
  );
}
