// MP3 decoding on the server (WASM mpg123: no native ffmpeg, works on Vercel) for loudness measurement.
import { MPEGDecoder } from "mpg123-decoder";
import { measurePcm, type Measure } from "./loudness";

let decoder: MPEGDecoder | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Decode an MP3 and measure it. One shared decoder, reset between clips; calls run one at a time. */
export function measureMp3(bytes: Uint8Array): Promise<Measure> {
  const run = queue.then(async () => {
    if (!decoder) {
      decoder = new MPEGDecoder();
      await decoder.ready;
    } else await decoder.reset();
    const out = decoder.decode(bytes);
    if (!out.samplesDecoded) throw new Error(`could not decode (${out.errors.length} errors)`);
    return measurePcm(out.channelData, out.sampleRate);
  });
  queue = run.catch(() => undefined);
  return run;
}
