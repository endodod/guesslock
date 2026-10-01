"use client";
// The Resonance: brass gramophone-horn players. Abstract on purpose (no waveform: its shape and length
// would be a clue across days). Never autoplays; Space/Enter on the focused button toggles play.
import { useEffect, useRef, useState } from "react";
import type { SoundClipView } from "@/lib/engine/types";
import { isIOS, playClip, type Playback } from "@/lib/client/audio";
import { useGame } from "./GameProvider";
import { DecoFrame } from "./ui";

/** Gramophone horn inside a speaker grille. */
function Horn({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 30h5l14 10V8L13 18H8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M27 8c6 3 11 9 11 16s-5 13-11 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M31 16c2 2 3 5 3 8s-1 6-3 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

let tipShown = false;

export function SoundPlayer({
  src, gainDb, muffled, label, small = false, done = false,
}: { src: string; gainDb: number; muffled: boolean; label: string; small?: boolean; done?: boolean }) {
  const { store, reducedMotion, toast } = useGame();
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [progress, setProgress] = useState(0);
  const [plays, setPlays] = useState(0);
  const pb = useRef<Playback | null>(null);
  const raf = useRef(0);

  useEffect(() => () => { pb.current?.stop(); cancelAnimationFrame(raf.current); }, []);

  const toggle = async () => {
    if (state === "playing") { pb.current?.stop(); return; }
    if (state === "loading") return;
    setState("loading");
    try {
      const p = await playClip({ url: src, gainDb, muffled, volume: store.settings.soundVolume });
      pb.current = p;
      setState("playing");
      setPlays((n) => n + 1);
      if (!tipShown && isIOS()) { tipShown = true; toast("No sound? Check your silent switch."); }
      const tick = () => {
        if (pb.current !== p) return;
        setProgress(p.progress());
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      await p.ended;
      if (pb.current === p) pb.current = null;
      cancelAnimationFrame(raf.current);
      setState("idle");
      setProgress(0);
    } catch {
      setState("idle");
      toast("The sound won't play. Try again.");
    }
  };

  const size = small ? 44 : 112;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const playing = state === "playing";
  const action = playing ? "Stop" : done ? "Play again" : "Play";
  return (
    <div className={`flex ${small ? "items-center gap-2" : "flex-col items-center gap-2"}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${action} ${label}${muffled ? " (muffled)" : ""}`}
        aria-pressed={playing}
        className="group relative inline-flex shrink-0 items-center justify-center rounded-full border-2 border-brass/70 bg-[repeating-radial-gradient(circle,#3a3129_0_2px,#1d1a16_2px_5px)] text-brass shadow-[inset_0_0_18px_rgba(0,0,0,0.8),0_0_0_4px_rgba(26,24,22,1),0_0_0_5px_rgba(201,164,92,0.35)] transition-colors hover:text-paper focus-visible:text-paper"
        style={{ width: size, height: size }}
      >
        <svg className="absolute inset-0 -rotate-90" width={size} height={size} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ecto)" strokeWidth={small ? 2 : 3} strokeDasharray={c} strokeDashoffset={c * (1 - progress)} opacity={playing ? 1 : 0} />
        </svg>
        <Horn className={`${small ? "h-6 w-6" : "h-14 w-14"} ${playing && !reducedMotion ? "animate-pulse" : ""} ${state === "loading" ? "opacity-50" : ""}`} />
      </button>
      <span className={`flex items-center gap-2 ${small ? "text-sm" : "text-center"}`}>
        <span className="font-display text-paper">{label}</span>
        {muffled && <span className="smallcaps rounded-sm border border-brass/30 px-1.5 text-[0.65rem] text-ash">muffled</span>}
        {plays > 0 && <span className="font-mono text-xs text-ash" aria-label={`played ${plays} times`}>×{plays}</span>}
      </span>
      {done && !small && (
        <button type="button" onClick={toggle} className="min-h-9 px-2 text-sm text-brass underline-offset-4 hover:underline" tabIndex={-1} aria-hidden>
          {action}
        </button>
      )}
    </div>
  );
}

/** Clue stage: one player per unlocked clip, placeholders for locked ones. */
export function SoundStage({ clue, done }: { clue: { clips: SoundClipView[]; total: number; slot?: number | null }; done: boolean }) {
  const { store } = useGame();
  const hard = store.settings.muffledOnly && !done;
  return (
    <DecoFrame className="clue-layer p-5 md:p-7">
      {clue.slot ? (
        <p className="smallcaps mb-4 text-center text-sm text-brass">Cast of {clue.slot === 4 ? "the Ultimate" : `Ability ${clue.slot}`}</p>
      ) : (
        <p className="smallcaps mb-4 text-center text-sm text-ash">Which ability? Not telling.</p>
      )}
      <ul className="flex flex-wrap items-start justify-center gap-8 md:gap-14">
        {Array.from({ length: clue.total }, (_, i) => {
          const clip = clue.clips[i];
          return (
            <li key={i}>
              {clip ? (
                <SoundPlayer key={clip.url} src={clip.url} gainDb={clip.gainDb} muffled={clip.muffled || hard} label={clip.label} done={done} />
              ) : (
                <div className="flex flex-col items-center gap-2 opacity-60">
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-brass/30 bg-ink/40">
                    <span className="font-display text-3xl text-brass/60">?</span>
                  </div>
                  <span className="text-center text-xs text-ash">{`Sound ${i + 1}`}<br />after {i + 1} wrong guesses</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-center text-sm text-ash">
        {done ? "Every sound, unfiltered." : clue.clips[0]?.muffled || hard ? "Heard through the vault door. Tap to listen." : "Tap to listen, as often as you like."}
      </p>
    </DecoFrame>
  );
}
