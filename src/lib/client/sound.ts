// Tiny synthesized SFX (no audio files). Off by default; enabled in Settings.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(a: AudioContext, t: number, dur: number, freq: number, gain: number) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 3;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  /** Small metallic tick: wrong guess. */
  tick() {
    const a = ac(); if (!a) return;
    noiseBurst(a, a.currentTime, 0.05, 4200, 0.25);
  },
  /** Lock click: correct guess. */
  click() {
    const a = ac(); if (!a) return;
    noiseBurst(a, a.currentTime, 0.04, 2600, 0.5);
    noiseBurst(a, a.currentTime + 0.09, 0.07, 1400, 0.6);
  },
  /** Heavy door creak: daily complete. */
  creak() {
    const a = ac(); if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    const f = a.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, a.currentTime);
    o.frequency.linearRampToValueAtTime(110, a.currentTime + 1.2);
    f.type = "lowpass";
    f.frequency.value = 600;
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, a.currentTime + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.4);
    o.connect(f).connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 1.5);
  },
};
