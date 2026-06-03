import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { computeEditList, DEFAULT_OPTIONS, type Word } from "./editlist";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const AE_PUBLIC = path.join(PUBLIC_DIR, "auto-edit");

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const ACCENT = "#FFD400";

function run(cmd: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`)),
    );
  });
}

function probeDuration(file: string): Promise<number> {
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

// Build the ffmpeg trim/concat filtergraph that keeps only the segments and
// cleans the audio (rumble cut, denoise, loudness-normalize to -14 LUFS).
function buildFilter(segments: { start: number; end: number }[]): string {
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

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("usage: auto-edit.ts <input-video> [--no-filler] [--music <public-rel>]");
    process.exit(2);
  }
  const noFiller = process.argv.includes("--no-filler");
  const musicIdx = process.argv.indexOf("--music");
  const music = musicIdx > -1 ? process.argv[musicIdx + 1] : undefined;

  const abs = path.resolve(input);
  await fs.access(abs);
  await fs.mkdir(AE_PUBLIC, { recursive: true });
  const ts = Date.now();
  const work = path.join(ROOT, "out", `auto-edit-${ts}`);
  await fs.mkdir(work, { recursive: true });

  // 1. Transcribe (faster-whisper, word timestamps)
  const wordsPath = path.join(work, "words.json");
  console.log("[auto-edit] transcribing...");
  await run("python3", [path.join(__dirname, "transcribe.py"), abs, wordsPath], "transcribe");
  const { words, duration } = JSON.parse(await fs.readFile(wordsPath, "utf8")) as {
    words: Word[];
    duration: number;
  };
  const mediaDuration = duration || (await probeDuration(abs));

  // 2. Edit list (cut silence + filler, remap captions)
  const edit = computeEditList(words, mediaDuration, {
    ...DEFAULT_OPTIONS,
    removeFiller: !noFiller,
  });
  await fs.writeFile(path.join(work, "editlist.json"), JSON.stringify(edit, null, 2));
  console.log(
    `[auto-edit] ${words.length} words -> ${edit.segments.length} segments, ` +
      `${edit.removedFillerCount} filler removed, ${mediaDuration.toFixed(1)}s -> ${edit.trimmedDuration.toFixed(1)}s`,
  );

  // 3. Assemble trimmed + cleaned video
  const trimmed = path.join(AE_PUBLIC, "trimmed.mp4");
  console.log("[auto-edit] assembling trimmed video...");
  await run(
    "ffmpeg",
    [
      "-y", "-i", abs,
      "-filter_complex", buildFilter(edit.segments),
      "-map", "[vc]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      trimmed,
    ],
    "ffmpeg-assemble",
  );
  await fs.writeFile(path.join(AE_PUBLIC, "captions.json"), JSON.stringify(edit.captions));

  // 4. Render captions over the trimmed video
  const trimmedDur = await probeDuration(trimmed);
  const durationInFrames = Math.max(1, Math.round(trimmedDur * FPS));
  console.log(`[auto-edit] rendering captions (${durationInFrames} frames)...`);
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src/index.tsx"), publicDir: PUBLIC_DIR });
  const inputProps = {
    videoSrc: "auto-edit/trimmed.mp4",
    captions: edit.captions,
    accent: ACCENT,
    maxWordsPerGroup: 3,
    ...(music ? { music } : {}),
  };
  const composition = await selectComposition({
    serveUrl,
    id: "TalkingHead",
    inputProps: inputProps as Record<string, unknown>,
  });
  const outFile = path.join(ROOT, "out", `talking-head-${ts}.mp4`);
  await renderMedia({
    composition: { ...composition, width: WIDTH, height: HEIGHT, fps: FPS, durationInFrames },
    serveUrl,
    codec: "h264",
    outputLocation: outFile,
    inputProps: inputProps as Record<string, unknown>,
    chromiumOptions: { gl: "swangle" },
    concurrency: Math.min(4, Math.max(2, os.cpus().length - 1)),
    offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024,
    onProgress: ({ progress }) => process.stdout.write(`\r[auto-edit] ${(progress * 100).toFixed(0)}%   `),
  });
  console.log(`\n[auto-edit] done -> ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
