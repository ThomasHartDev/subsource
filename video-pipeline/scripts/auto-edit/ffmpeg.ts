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

// Trim + concat the keep-segments and clean the voice: rumble cut, light
// denoise, loudness-normalize to -14 LUFS (YouTube spec, safe for IG/TikTok).
export function buildTrimFilter(segments: { start: number; end: number }[]): string {
  const parts: string[] = [];
  const labels: string[] = [];
  segments.forEach((s, i) => {
    parts.push(`[0:v]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
  });
  parts.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=1[vc][ac]`);
  parts.push(`[ac]highpass=f=80,afftdn=nr=10,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
  return parts.join(";");
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
