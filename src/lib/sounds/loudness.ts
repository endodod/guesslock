// Loudness measurement and normalization for The Resonance (pure; unit-tested).
// Loudness = RMS of the loudest 400 ms window (like EBU "momentary" loudness, without K-weighting):
// ability sounds are short bursts, so a whole-clip RMS would mostly measure the silent tail.

/** Every clip plays at this loudness (dBFS, loudest 400 ms window) after its stored gain. */
export const LOUDNESS_TARGET_DB = -20;
/** Gain never pushes the peak above this (Web Audio would clip). */
export const PEAK_CEILING_DB = -1;
export const MAX_GAIN_DB = 18;
export const MIN_GAIN_DB = -24;

const WINDOW_S = 0.4;
const HOP_S = 0.1;
const SILENCE_DB = -120;

export type Measure = { durationMs: number; peakDb: number; loudnessDb: number };

const toDb = (x: number) => (x > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(x)) : SILENCE_DB);
const round1 = (x: number) => Math.round(x * 10) / 10;

export function measurePcm(channels: Float32Array[], sampleRate: number): Measure {
  const n = channels[0]?.length ?? 0;
  if (!n || !sampleRate) return { durationMs: 0, peakDb: SILENCE_DB, loudnessDb: SILENCE_DB };
  // Mono mix of squared samples (power), plus the absolute peak over all channels.
  const power = new Float64Array(n);
  let peak = 0;
  for (const ch of channels)
    for (let i = 0; i < n; i++) {
      const v = ch[i];
      power[i] += (v * v) / channels.length;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
  const win = Math.min(n, Math.max(1, Math.round(WINDOW_S * sampleRate)));
  const hop = Math.max(1, Math.round(HOP_S * sampleRate));
  // Prefix sums make every window O(1).
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + power[i];
  let loudest = 0;
  for (let start = 0; start + win <= n; start += hop) loudest = Math.max(loudest, (prefix[start + win] - prefix[start]) / win);
  loudest = Math.max(loudest, (prefix[n] - prefix[n - win]) / win); // the last window, when hops don't land on it
  return { durationMs: Math.round((n / sampleRate) * 1000), peakDb: round1(toDb(peak)), loudnessDb: round1(toDb(Math.sqrt(loudest))) };
}

/** Gain (dB) that brings a clip to the target loudness without its peak passing the ceiling. */
export function gainFor(m: Pick<Measure, "peakDb" | "loudnessDb">): number {
  if (m.loudnessDb <= SILENCE_DB) return 0;
  const wanted = LOUDNESS_TARGET_DB - m.loudnessDb;
  const headroom = PEAK_CEILING_DB - m.peakDb;
  return round1(Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, wanted, headroom)));
}

/** Linear factor for a gain in dB (Web Audio GainNode). */
export const dbToGain = (db: number) => Math.pow(10, db / 20);
