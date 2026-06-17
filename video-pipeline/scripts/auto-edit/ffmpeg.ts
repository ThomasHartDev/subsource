// Shared ffmpeg/ffprobe helpers for the auto-edit pipeline. Kept separate from
// the orchestrator so the packager (per-platform re-encode) can reuse them.
import { spawn } from "node:child_process";

export function run(cmd: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`)),
    );
  });
}

export function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=nokey=1:noprint_wrappers=1",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(parseFloat(out.trim())) : reject(new Error("ffprobe failed")),
    );
  });
}

// Keep only the speech segments and clean the voice: rumble cut, light denoise,
// loudness-normalize to -14 LUFS (YouTube spec, safe for IG/TikTok).
//
// Uses select/aselect (one decode pass) rather than per-segment trim+concat. The
// trim approach splits the input into N branches whose fifos buffer frames until
// every branch drains, and that buffer scales with resolution — a 1080x1920@60
// source pushed ffmpeg past 5GB RSS and earlyoom killed it. select drops
// out-of-segment frames in a single pass with no fifo buildup. setpts=N/.../TB
// repacks the kept frames onto a continuous timeline.
export function buildTrimFilter(segments: { start: number; end: number }[]): string {
  const between = segments.map((s) => `between(t,${s.start},${s.end})`).join("+");
  const v = `[0:v]select='${between}',setpts=N/FRAME_RATE/TB[vc]`;
  const a =
    `[0:a]aselect='${between}',asetpts=N/SR/TB,` +
    `highpass=f=80,afftdn=nr=10,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`;
  return `${v};${a}`;
}

// Sidechain-duck a music bed under the voice and remaster to -14 LUFS.
// The voice (input 0) triggers the compressor; the music (input 1) is what gets
// pushed down whenever the voice is present. Because the editor already cut the
// silence, the voice is on almost the whole time, so the bed stays politely
// under it instead of fighting the words.
export function buildMusicDuckFilter(): string {
  return [
    // Loop the bed to cover the (possibly longer) voice track, then sit it ~12 LU
    // under the eventual voice target so it's audible but never competes.
    `[1:a]aloop=loop=-1:size=2147483647,loudnorm=I=-26:TP=-2:LRA=11[bed]`,
    // main = bed, sidechain = voice. Voice peaks -> bed ducks further.
    // makeup=1 is unity (no post-gain); ffmpeg rejects 0 (valid range [1,64]).
    `[bed][0:a]sidechaincompress=threshold=0.04:ratio=8:attack=5:release=250:makeup=1[ducked]`,
    // Mix voice + ducked bed without auto-normalizing (keeps the voice forward),
    // then master the sum to broadcast loudness.
    `[0:a][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`,
    `[mix]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
  ].join(";");
}
