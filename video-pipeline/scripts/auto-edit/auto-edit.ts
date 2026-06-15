import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { computeEditList, DEFAULT_OPTIONS, type Word } from "./editlist";
import { run, probeDuration, buildTrimFilter, buildMusicDuckFilter } from "./ffmpeg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const AE_PUBLIC = path.join(PUBLIC_DIR, "auto-edit");

const FPS = 30;
const ACCENT = "#FFD400";

type Orientation = "vertical" | "landscape";
const FORMATS: Record<Orientation, { width: number; height: number; maxWords: number }> = {
  // Mobile: TikTok / Reels / Shorts. Center-crop the talking head to 9:16.
  vertical: { width: 1080, height: 1920, maxWords: 3 },
  // Desktop: YouTube / LinkedIn / X. Keep the full 16:9 frame, fit more per line.
  landscape: { width: 1920, height: 1080, maxWords: 5 },
};

function parseArgs(argv: string[]) {
  const input = argv[2];
  const noFiller = argv.includes("--no-filler");
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i > -1 ? argv[i + 1] : undefined;
  };
  // `--music default` uses the in-repo public/music.mp3 bed.
  let music = flag("--music");
  if (music === "default") music = "music.mp3";
  // `--formats vertical,landscape` (default both).
  const formatsArg = flag("--formats");
  const orientations = (formatsArg ? formatsArg.split(",") : ["vertical", "landscape"])
    .map((s) => s.trim())
    .filter((s): s is Orientation => s === "vertical" || s === "landscape");
  const slug = flag("--slug") ?? "talking-head";
  return { input, noFiller, music, orientations, slug };
}

async function main() {
  const { input, noFiller, music, orientations, slug } = parseArgs(process.argv);
  if (!input || orientations.length === 0) {
    console.error(
      "usage: auto-edit.ts <input-video> [--no-filler] [--music <public-rel|default>] " +
        "[--formats vertical,landscape] [--slug name]",
    );
    process.exit(2);
  }

  const abs = path.resolve(input);
  await fs.access(abs);
  await fs.mkdir(AE_PUBLIC, { recursive: true });
  const ts = Date.now();
  const work = path.join(ROOT, "out", `auto-edit-${ts}`);
  await fs.mkdir(work, { recursive: true });

  // 1. Transcribe (faster-whisper, word timestamps). Format-agnostic.
  const wordsPath = path.join(work, "words.json");
  console.log("[auto-edit] transcribing...");
  await run("python3", [path.join(__dirname, "transcribe.py"), abs, wordsPath], "transcribe");
  const { words, duration } = JSON.parse(await fs.readFile(wordsPath, "utf8")) as {
    words: Word[];
    duration: number;
  };
  const mediaDuration = duration || (await probeDuration(abs));

  // 2. Edit list (cut silence + filler, remap captions). Format-agnostic.
  const edit = computeEditList(words, mediaDuration, { ...DEFAULT_OPTIONS, removeFiller: !noFiller });
  await fs.writeFile(path.join(work, "editlist.json"), JSON.stringify(edit, null, 2));
  console.log(
    `[auto-edit] ${words.length} words -> ${edit.segments.length} segments, ` +
      `${edit.removedFillerCount} filler removed, ${mediaDuration.toFixed(1)}s -> ${edit.trimmedDuration.toFixed(1)}s`,
  );

  // 3. Assemble ONE cleaned master (trimmed video + voice cleaned to -14 LUFS).
  //    Both orientations render from this same source, so the cut + audio work
  //    happens once. Per-run filename avoids clobbering concurrent runs.
  const master = path.join(AE_PUBLIC, `master-${ts}.mp4`);
  console.log("[auto-edit] assembling cleaned master...");
  await run(
    "ffmpeg",
    [
      "-y", "-i", abs,
      "-filter_complex", buildTrimFilter(edit.segments),
      "-map", "[vc]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      master,
    ],
    "ffmpeg-assemble",
  );

  // 3b. Optional music bed: sidechain-duck it under the voice and remaster.
  //     Baked into the master's audio so every render carries the same mix.
  let videoSrcAbs = master;
  if (music) {
    const musicAbs = path.join(PUBLIC_DIR, music);
    await fs.access(musicAbs).catch(() => {
      throw new Error(`music bed not found: ${musicAbs} (path is relative to public/)`);
    });
    const mixed = path.join(AE_PUBLIC, `master-${ts}-music.mp4`);
    console.log(`[auto-edit] ducking music bed (${music}) under voice...`);
    await run(
      "ffmpeg",
      [
        "-y", "-i", master, "-i", musicAbs,
        "-filter_complex", buildMusicDuckFilter(),
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-shortest", mixed,
      ],
      "ffmpeg-music",
    );
    videoSrcAbs = mixed;
  }

  // 4. Render captions over the master, once per requested orientation.
  const videoSrcRel = `auto-edit/${path.basename(videoSrcAbs)}`;
  const masterDur = await probeDuration(videoSrcAbs);
  const durationInFrames = Math.max(1, Math.round(masterDur * FPS));
  console.log(`[auto-edit] bundling renderer (${durationInFrames} frames)...`);
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src/index.tsx"), publicDir: PUBLIC_DIR });

  const outputs: string[] = [];
  for (const orientation of orientations) {
    const fmt = FORMATS[orientation];
    const inputProps = {
      videoSrc: videoSrcRel,
      captions: edit.captions,
      accent: ACCENT,
      maxWordsPerGroup: fmt.maxWords,
      orientation,
    };
    const composition = await selectComposition({
      serveUrl,
      id: "TalkingHead",
      inputProps: inputProps as Record<string, unknown>,
    });
    const outFile = path.join(ROOT, "out", `${slug}-${orientation}-${ts}.mp4`);
    console.log(`[auto-edit] rendering ${orientation} (${fmt.width}x${fmt.height})...`);
    await renderMedia({
      composition: { ...composition, width: fmt.width, height: fmt.height, fps: FPS, durationInFrames },
      serveUrl,
      codec: "h264",
      outputLocation: outFile,
      inputProps: inputProps as Record<string, unknown>,
      chromiumOptions: { gl: "swangle" },
      concurrency: Math.min(4, Math.max(2, os.cpus().length - 1)),
      offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024,
      onProgress: ({ progress }) =>
        process.stdout.write(`\r[auto-edit] ${orientation} ${(progress * 100).toFixed(0)}%   `),
    });
    outputs.push(outFile);
    console.log(`\n[auto-edit] ${orientation} -> ${outFile}`);
  }

  console.log(`[auto-edit] done. ${outputs.length} format(s):\n${outputs.map((o) => "  " + o).join("\n")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
