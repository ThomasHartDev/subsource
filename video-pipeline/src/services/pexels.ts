import fs from "node:fs/promises";
import path from "node:path";

// Bait clip = a satisfying / hypnotic stock loop we cut INTO the ad as a
// pattern interrupt. Pexels is free and idempotent so we don't bother caching.

export type BaitCategory =
  | "cash_stack"
  | "kinetic_sand_cut"
  | "paint_pour"
  | "marble_fall"
  | "soap_carve"
  | "latte_art"
  | "hydraulic_press_crush"
  | "candle_wax_pour";

const BAIT_CATEGORIES: BaitCategory[] = [
  "cash_stack",
  "kinetic_sand_cut",
  "paint_pour",
  "marble_fall",
  "soap_carve",
  "latte_art",
  "hydraulic_press_crush",
  "candle_wax_pour",
];

const QUERY_MAP: Record<BaitCategory, string> = {
  cash_stack: "stack of cash money close up",
  kinetic_sand_cut: "kinetic sand satisfying",
  paint_pour: "paint pouring slow motion",
  marble_fall: "marble run satisfying",
  soap_carve: "soap carving asmr",
  latte_art: "latte art pour",
  hydraulic_press_crush: "hydraulic press",
  candle_wax_pour: "candle wax slow motion",
};

type PexelsVideoFile = {
  link: string;
  width: number | null;
  height: number | null;
  file_type: string;
};

type PexelsVideo = {
  id: number;
  duration: number;
  video_files: PexelsVideoFile[];
};

type PexelsSearchResponse = {
  videos: PexelsVideo[];
};

export async function getBaitClip(
  category: BaitCategory,
  outDir: string,
): Promise<{ clipPath: string; durationSec: number }> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY not set");
  }

  const outDirStat = await fs.stat(outDir).catch(() => null);
  if (!outDirStat || !outDirStat.isDirectory()) {
    throw new Error(`getBaitClip: outDir does not exist: ${outDir}`);
  }

  const query = QUERY_MAP[category];
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
    query,
  )}&per_page=5&orientation=portrait`;

  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    throw new Error(`Pexels search failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as PexelsSearchResponse;
  if (!body.videos || body.videos.length === 0) {
    throw new Error(`Pexels returned no videos for category "${category}" (query: ${query})`);
  }

  const video = body.videos[0]!;
  const file = pickBestMp4(video.video_files);
  if (!file) {
    throw new Error(`Pexels video ${video.id} has no usable mp4 variant`);
  }

  const clipPath = path.resolve(outDir, "bait.mp4");
  const dl = await fetch(file.link);
  if (!dl.ok) {
    throw new Error(`Pexels CDN download failed: ${dl.status}`);
  }
  const buf = Buffer.from(await dl.arrayBuffer());
  await fs.writeFile(clipPath, buf);

  return { clipPath, durationSec: video.duration };
}

// General free-text b-roll search: download the best mp4 for an arbitrary query
// to outPath. Used by the auto-editor to overlay example footage on concrete
// topics the speaker mentions. orientation biases which variant pickBestMp4
// prefers (portrait for vertical insets, landscape otherwise).
export async function searchClip(
  query: string,
  outPath: string,
  orientation: "portrait" | "landscape" = "landscape",
): Promise<{ clipPath: string; durationSec: number } | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY not set");
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status}`);
  const body = (await res.json()) as PexelsSearchResponse;
  if (!body.videos?.length) return null;
  // Prefer a clip at least 3s long so it covers a typical overlay window.
  const video = body.videos.find((v) => v.duration >= 3) ?? body.videos[0]!;
  const file = pickBestMp4(video.video_files);
  if (!file) return null;
  const dl = await fetch(file.link);
  if (!dl.ok) throw new Error(`Pexels CDN download failed: ${dl.status}`);
  await fs.writeFile(outPath, Buffer.from(await dl.arrayBuffer()));
  return { clipPath: outPath, durationSec: video.duration };
}

// Prefer 1080x1920 portrait or higher; otherwise the highest-resolution mp4.
function pickBestMp4(files: PexelsVideoFile[]): PexelsVideoFile | null {
  const mp4s = files.filter((f) => f.file_type === "video/mp4");
  if (mp4s.length === 0) return null;

  const score = (f: PexelsVideoFile): number => {
    const w = f.width ?? 0;
    const h = f.height ?? 0;
    return w * h;
  };

  // Try to find a portrait variant >= 1080x1920 first
  const portraitHd = mp4s.filter((f) => {
    const w = f.width ?? 0;
    const h = f.height ?? 0;
    return h >= 1920 && w >= 1080 && h >= w;
  });
  if (portraitHd.length > 0) {
    return portraitHd.reduce((a, b) => (score(a) >= score(b) ? a : b));
  }

  // Fall back to highest-resolution mp4 of any orientation
  return mp4s.reduce((a, b) => (score(a) >= score(b) ? a : b));
}

export function pickBaitCategory(seed: string): BaitCategory {
  const idx = hashStr(seed) % BAIT_CATEGORIES.length;
  return BAIT_CATEGORIES[idx]!;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
