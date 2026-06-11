#!/usr/bin/env npx tsx
// Renders a site commercial from a spec JSON.
//
// Usage:
//   node --import tsx scripts/site-commercial/render.ts <spec.json> [out.mp4] \
//     [--scale 0.5] [--frames 0-180]
//
// 2D specs (beats) render the SiteCommercial composition; 3D specs (journey)
// render SiteCommercial3D. --scale/--frames are for fast preview passes.
// All asset paths in specs (captures, logos, audio) are relative to public/.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { commercialSpecSchema } from "../../src/site-commercial/types";
import { spec3dSchema } from "../../src/site-commercial/types3d";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--scale") && !argv[i - 1]?.startsWith("--frames"));
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const [specPath, outArg] = positional;
  if (!specPath) {
    console.error("usage: render.ts <spec.json> [out.mp4] [--scale 0.5] [--frames 0-180]");
    process.exit(1);
  }
  const scale = Number(flag("scale") ?? 1);
  const framesArg = flag("frames");
  const frameRange = framesArg
    ? (framesArg.split("-").map(Number) as [number, number])
    : undefined;

  const raw = JSON.parse(await fs.readFile(specPath, "utf-8"));
  const is3d = "journey" in raw;
  const spec = is3d ? spec3dSchema.parse(raw) : commercialSpecSchema.parse(raw);

  // default output lives OUTSIDE the repo: out/ is gitignored and shared-tree
  // sweeps (git clean from other agents) have eaten finished renders before
  const outPath = path.resolve(
    outArg ??
      path.join(os.homedir(), ".command-center", "exports", "site-commercials", `${spec.name}.mp4`),
  );
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  console.log(
    `Bundling (spec: ${spec.name}, ${is3d ? "3D" : "2D"}, ${spec.format} @ ${spec.fps}fps)...`,
  );
  const bundled = await bundle({
    entryPoint: path.join(ROOT, "src", "site-commercial", "index.ts"),
    webpackOverride: (config) => config,
  });

  const inputProps = { spec };
  const composition = await selectComposition({
    serveUrl: bundled,
    id: is3d ? "SiteCommercial3D" : "SiteCommercial",
    inputProps,
  });

  console.log(
    `Rendering ${composition.durationInFrames} frames at ${composition.width}x${composition.height}...`,
  );
  let lastLogged = -1;
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    crf: 18,
    outputLocation: outPath,
    inputProps,
    scale,
    frameRange,
    // shared box — don't let Chrome tabs eat all the cores
    concurrency: Math.min(4, Math.max(1, os.cpus().length - 2)),
    // headless Linux without a GPU silently botches transforms/blur on the
    // default GL backend; swangle renders them correctly
    chromiumOptions: process.platform === "linux" ? { gl: "swangle" } : undefined,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct > lastLogged) {
        lastLogged = pct;
        console.log(`  ${pct}%`);
      }
    },
  });

  const stat = await fs.stat(outPath);
  console.log(`\nDone: ${outPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
