#!/usr/bin/env npx tsx
// Renders a site commercial from a spec JSON.
//
// Usage:
//   node --import tsx scripts/site-commercial/render.ts <spec.json> [out.mp4]
//
// The spec schema lives in src/site-commercial/types.ts. All asset paths in
// the spec (captures, logos, audio) are relative to public/.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { commercialSpecSchema } from "../../src/site-commercial/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const [specPath, outArg] = process.argv.slice(2);
  if (!specPath) {
    console.error("usage: render.ts <spec.json> [out.mp4]");
    process.exit(1);
  }

  const raw = JSON.parse(await fs.readFile(specPath, "utf-8"));
  const spec = commercialSpecSchema.parse(raw);

  const outPath = path.resolve(
    outArg ?? path.join(ROOT, "out", "site-commercial", `${spec.name}.mp4`),
  );
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  console.log(`Bundling (spec: ${spec.name}, ${spec.format} @ ${spec.fps}fps)...`);
  const bundled = await bundle({
    entryPoint: path.join(ROOT, "src", "site-commercial", "index.ts"),
    webpackOverride: (config) => config,
  });

  const inputProps = { spec };
  const composition = await selectComposition({
    serveUrl: bundled,
    id: "SiteCommercial",
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
