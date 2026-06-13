/**
 * render-claymation-dry.ts — validates the v5 Remotion pipeline without
 * generating new Veo clips (no FAL spend).
 *
 * Pass three existing mp4 paths + an audio path as CLI args:
 *   pnpm tsx scripts/render-claymation-dry.ts \
 *     path/to/shot0.mp4 path/to/shot1.mp4 path/to/shot2.mp4 path/to/vo.mp3
 *
 * Useful when FAL balance is exhausted or when you want to re-render
 * with new overlays on previously generated clips.
 *
 * Output: out/linkeditch-clay-v5-dry-<ts>.mp4
 */
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { parseMedia } from "@remotion/media-parser";
import type { LinkeditchAdProps } from "../src/template/LinkeditchAd";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FPS = 30;
const FREEZE_SEC = 1.5;

async function getFrameCount(clipPath: string): Promise<number> {
  const { durationInSeconds } = await parseMedia({
    src: clipPath,
    fields: { durationInSeconds: true },
  });
  return Math.round((durationInSeconds ?? 6) * FPS);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error(
      "Usage: pnpm tsx scripts/render-claymation-dry.ts <shot0.mp4> <shot1.mp4> <shot2.mp4> <vo.mp3>",
    );
    process.exit(1);
  }

  const s1 = path.resolve(args[0] as string);
  const s2 = path.resolve(args[1] as string);
  const s3 = path.resolve(args[2] as string);
  const voSrc = path.resolve(args[3] as string);

  for (const f of [s1, s2, s3, voSrc]) {
    await fs.access(f).catch(() => {
      throw new Error(`File not found: ${f}`);
    });
  }

  const timestamp = Date.now();
  // Remotion needs a public dir for staticFile() resolution.
  const publicDir = path.join(ROOT, "out", `dry-${timestamp}`, "public");
  await fs.mkdir(path.join(publicDir, "clips"), { recursive: true });
  await fs.mkdir(path.join(publicDir, "audio"), { recursive: true });

  // Symlink (or copy) the source files into public/ so staticFile() can find them.
  const clip1Dest = path.join(publicDir, "clips", "shot-0.mp4");
  const clip2Dest = path.join(publicDir, "clips", "shot-1.mp4");
  const clip3Dest = path.join(publicDir, "clips", "shot-2.mp4");
  const voDest = path.join(publicDir, "audio", "vo.mp3");

  await Promise.all([
    fs.copyFile(s1, clip1Dest),
    fs.copyFile(s2, clip2Dest),
    fs.copyFile(s3, clip3Dest),
    fs.copyFile(voSrc, voDest),
  ]);

  console.log("[dry] measuring clip durations...");
  const [clip1Frames, clip2Frames, clip3Frames] = await Promise.all([
    getFrameCount(clip1Dest),
    getFrameCount(clip2Dest),
    getFrameCount(clip3Dest),
  ]);
  const freezeFrames = Math.round(FREEZE_SEC * FPS);
  console.log(
    `[dry] frames: ${clip1Frames} / ${clip2Frames} / ${clip3Frames} / freeze ${freezeFrames}`,
  );

  const inputProps: LinkeditchAdProps = {
    clip1Path: "clips/shot-0.mp4",
    clip2Path: "clips/shot-1.mp4",
    clip3Path: "clips/shot-2.mp4",
    voPath: "audio/vo.mp3",
    clip1Frames,
    clip2Frames,
    clip3Frames,
    freezeFrames,
  };

  console.log("[dry] bundling remotion...");
  const bundleLocation = await bundle({
    entryPoint: path.join(ROOT, "src", "index.tsx"),
    publicDir,
  });

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "LinkeditchAd",
    inputProps,
  });

  const finalPath = path.join(ROOT, "out", `linkeditch-clay-v5-dry-${timestamp}.mp4`);
  console.log("[dry] rendering...");
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: finalPath,
    inputProps,
    concurrency: 4,
    crf: 18,
    pixelFormat: "yuv420p",
  });

  const stat = await fs.stat(finalPath);
  console.log(`\n=== dry render complete ===`);
  console.log(`output: ${finalPath}`);
  console.log(`size:   ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`cost:   $0 (no Veo, no Cartesia)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
