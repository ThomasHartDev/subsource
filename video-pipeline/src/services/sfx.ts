import path from "node:path";
import { fileURLToPath } from "node:url";

// Interrupt SFX for the bait-clip cut. Files live alongside the Remotion
// template so the bundler picks them up automatically. The stub generator at
// scripts/generate-stub-sfx.ts emits 0.3s silent mp3s; swap in real samples
// later (record-scratch, vinyl-rewind, glass-shatter) without touching this
// file's API.

export type SfxId =
  | "record_scratch_freeze"
  | "vinyl_rewind"
  | "glass_shatter_stop";

const SFX_IDS: SfxId[] = [
  "record_scratch_freeze",
  "vinyl_rewind",
  "glass_shatter_stop",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// services -> src -> template/sfx
const SFX_DIR = path.resolve(__dirname, "..", "template", "sfx");

const FILE_MAP: Record<SfxId, string> = {
  record_scratch_freeze: "record_scratch_freeze.mp3",
  vinyl_rewind: "vinyl_rewind.mp3",
  glass_shatter_stop: "glass_shatter_stop.mp3",
};

export function pickSfx(seed: string): SfxId {
  const idx = hashStr(seed) % SFX_IDS.length;
  return SFX_IDS[idx]!;
}

export function getSfxPath(id: SfxId): string {
  const fileName = FILE_MAP[id];
  return path.resolve(SFX_DIR, fileName);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
