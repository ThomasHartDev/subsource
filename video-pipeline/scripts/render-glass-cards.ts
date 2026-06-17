import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { generateMusic as stableMusic } from "../src/services/music-stable";
import { SHOTS_FRAMES, type GlassCardsProps } from "../src/template/GlassCards";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

// REPLICATE_API_KEY etc. live in .env; node 22 can load it directly.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // env may already be present in the shell; carry on
}

const MUSIC_PROMPT =
  "driving electronic tech music, glitchy synth arpeggios, deep pulsing sub bass, " +
  "futuristic dark cyberpunk, steady four-on-the-floor beat, energetic, no vocals";

type Mode = "test" | "full" | "still";

async function ensureMusic(): Promise<string | undefined> {
  const musicPath = path.join(PUBLIC_DIR, "music.mp3");
  const exists = await fs
    .stat(musicPath)
    .then((s) => s.isFile() && s.size > 1024)
    .catch(() => false);
  if (exists) {
    console.log(`[glass] reusing cached music at public/music.mp3`);
    return "music.mp3";
  }
  if (!process.env.REPLICATE_API_KEY) {
    console.warn(`[glass] REPLICATE_API_KEY missing — rendering without music`);
    return undefined;
  }
  console.log(`[glass] generating techy track via Stable Audio...`);
  const t0 = Date.now();
  try {
    await stableMusic(MUSIC_PROMPT, PUBLIC_DIR);
    console.log(`[glass] music ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return "music.mp3";
  } catch (e) {
    console.warn(`[glass] music generation failed: ${e instanceof Error ? e.message : e}`);
    return undefined;
  }
}

async function main() {
  const mode = (process.argv[2] as Mode) || "full";
  const isTest = mode === "test" || mode === "still";

  const width = isTest ? 360 : 1080;
  const height = isTest ? 640 : 1920;
  const fps = 30;
  const durationInFrames = SHOTS_FRAMES;
  // DOF is very expensive under software GL; the soft radial orbs already give
  // the out-of-focus depth look, so bloom-only keeps render time sane.
  const effects: GlassCardsProps["effects"] = "bloom";

  // Test renders validate the WebGL path only — skip the music spend until
  // the visuals are confirmed good.
  const music = isTest ? undefined : await ensureMusic();

  console.log(`[glass] bundling (publicDir=${PUBLIC_DIR})...`);
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "src/index.tsx"),
    publicDir: PUBLIC_DIR,
  });

  // undefined gets dropped during inputProps serialization (falls back to the
  // composition default), so pass an explicit "" to mean "no music".
  const inputProps = { effects, music: music ?? "" } as Partial<GlassCardsProps>;

  const composition = await selectComposition({
    serveUrl,
    id: "GlassCards",
    inputProps: inputProps as Record<string, unknown>,
  });

  const ts = Date.now();
  await fs.mkdir(path.join(ROOT, "out"), { recursive: true });

  if (mode === "still") {
    // WARNING: renderStill + @remotion/three does NOT reliably capture the
    // WebGL canvas here — it screenshots before the GL context paints, so every
    // frame comes back as the bare AbsoluteFill background (byte-identical
    // near-black). renderMedia advances frames and paints correctly. Use `test`
    // (a short renderMedia) for look-checks; extract frames with ffmpeg.
    const frames = [45, 75, 105];
    for (const frame of frames) {
      const out = path.join(ROOT, "out", `glass-still-${frame}-${ts}.png`);
      await renderStill({
        composition: { ...composition, width, height, fps, durationInFrames },
        serveUrl,
        output: out,
        frame,
        inputProps: inputProps as Record<string, unknown>,
        chromiumOptions: { gl: "swangle" },
        timeoutInMilliseconds: 180_000,
      });
      console.log(`[glass] still frame ${frame} -> ${out}`);
    }
    return;
  }

  const outFile = path.join(ROOT, "out", `glass-cards-${mode}-${ts}.mp4`);

  console.log(
    `[glass] rendering ${width}x${height} @${fps}fps, ${durationInFrames} frames, effects=${effects}, gl=swangle`,
  );
  const t0 = Date.now();
  await renderMedia({
    composition: { ...composition, width, height, fps, durationInFrames },
    serveUrl,
    codec: "h264",
    outputLocation: outFile,
    inputProps: inputProps as Record<string, unknown>,
    // hetzner has no GPU — SwiftShader-via-ANGLE is the software WebGL path.
    chromiumOptions: { gl: "swangle" },
    // R3F frames (texture load + transmission + bloom) can be slow under
    // software GL; keep concurrency modest and the per-frame timeout generous.
    // 8 vCPU / ~9GB free; each software-GL tab is memory-heavy, so cap at 4 to
    // stay clear of OOM (this box has a history of OOM-killing builds).
    concurrency: 4,
    timeoutInMilliseconds: 180_000,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r[glass] ${(progress * 100).toFixed(1)}%   `);
    },
  });
  const stat = await fs.stat(outFile);
  console.log(
    `\n[glass] done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outFile} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
