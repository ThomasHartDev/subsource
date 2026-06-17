// TODO: replace stub SFX with real record-scratch / vinyl-rewind / glass-shatter
// samples. Pixabay sounds API is auth-walled; manual download from
// pixabay.com/sound-effects/ is the next-easiest path. Until then we ship 0.3s
// silent mp3s so typecheck + composition wiring stays green.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STUB_NAMES = [
  "record_scratch_freeze.mp3",
  "vinyl_rewind.mp3",
  "glass_shatter_stop.mp3",
];

const OUT_DIR = path.resolve(__dirname, "..", "src", "template", "sfx");
const DURATION_SEC = 0.3;

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const name of STUB_NAMES) {
    const target = path.join(OUT_DIR, name);
    await renderSilentMp3(target, DURATION_SEC);
    const stat = await fs.stat(target);
    if (stat.size === 0) {
      throw new Error(`ffmpeg produced empty file: ${target}`);
    }
    console.log(`wrote ${target} (${stat.size} bytes)`);
  }
}

function renderSilentMp3(outPath: string, durationSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-f", "lavfi",
      "-i", "anullsrc=r=44100:cl=stereo",
      "-t", String(durationSec),
      "-q:a", "9",
      outPath,
    ];
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
