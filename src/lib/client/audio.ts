// Web Audio playback for The Resonance: stored gain, optional low-pass ("heard through the vault door"),
// volume setting, one clip at a time. Never starts on its own: every call comes from a tap or keypress.
import { dbToGain } from "@/lib/sounds/loudness";

/** Low-pass cutoff for muffled clips (Hz). */
export const MUFFLE_HZ = 700;
/** Long loops are cut off here, with a short fade. */
export const MAX_PLAY_S = 8;
const FADE_S = 0.3;

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

function ac(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

function load(url: string): Promise<AudioBuffer> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => ac().decodeAudioData(b));
    p.catch(() => buffers.delete(url)); // allow a retry
    buffers.set(url, p);
  }
  return p;
}

export type Playback = {
  duration: number;
  /** 0…1 */
  progress(): number;
  stop(): void;
  ended: Promise<void>;
};

let current: Playback | null = null;

export async function playClip(o: { url: string; gainDb: number; muffled: boolean; volume: number }): Promise<Playback> {
  const a = ac();
  if (a.state === "suspended") await a.resume();
  const buf = await load(o.url);
  current?.stop();

  const src = a.createBufferSource();
  src.buffer = buf;
  const gain = a.createGain();
  const level = dbToGain(o.gainDb) * Math.max(0, Math.min(1, o.volume));
  const duration = Math.min(buf.duration, MAX_PLAY_S);
  const t0 = a.currentTime + 0.02;
  gain.gain.setValueAtTime(level, t0);
  if (buf.duration > MAX_PLAY_S) {
    gain.gain.setValueAtTime(level, t0 + duration - FADE_S);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + duration);
  }
  if (o.muffled) {
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = MUFFLE_HZ;
    lp.Q.value = 0.7;
    src.connect(lp).connect(gain);
  } else src.connect(gain);
  gain.connect(a.destination);

  let done = false;
  const ended = new Promise<void>((resolve) => {
    src.onended = () => {
      done = true;
      if (current === pb) current = null;
      resolve();
    };
  });
  src.start(t0, 0, duration);
  const pb: Playback = {
    duration,
    progress: () => (done ? 1 : Math.max(0, Math.min(1, (a.currentTime - t0) / duration))),
    stop: () => {
      if (done) return;
      try { src.stop(); } catch { /* already stopped */ }
    },
    ended,
  };
  current = pb;
  return pb;
}

/** iOS mutes Web Audio with the silent switch on some versions. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
