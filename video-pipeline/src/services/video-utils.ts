import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

// Extract the last frame from a video as a PNG. Uses -sseof -0.1 to seek 100ms
// before the end, which is reliable across containers without re-encoding.
export async function extractLastFrame(videoPath: string, outPath?: string): Promise<string> {
  const stat = await fs.stat(videoPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`extractLastFrame: video does not exist: ${videoPath}`);
  }
  const target =
    outPath ??
    path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.lastframe.png`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      ["-y", "-sseof", "-0.1", "-i", videoPath, "-frames:v", "1", target],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });

  return target;
}

// Upload a local file for Veo image-to-video conditioning.
// Tries fal.ai's REST storage host first, then falls back to a base64 data URL
// (which Veo accepts on most fal endpoints as of Apr 2026).
export async function uploadToFalStorage(localPath: string): Promise<string> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  const stat = await fs.stat(localPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`uploadToFalStorage: file does not exist: ${localPath}`);
  }

  const buf = await fs.readFile(localPath);
  const filename = path.basename(localPath);
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : "application/octet-stream";

  // Try fal.ai's REST storage endpoint (different host from queue.fal.run).
  // If it succeeds, we get a stable CDN URL. If it fails, we fall back to data URL.
  for (const endpoint of [
    "https://rest.alpha.fal.ai/storage/upload",
    "https://fal.run/storage/upload",
  ]) {
    try {
      const form = new FormData();
      const blob = new Blob([buf], { type: contentType });
      form.append("file", blob, filename);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Key ${apiKey}` },
        body: form,
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (json) {
        const url = pickUrl(json);
        if (url) return url;
      }
    } catch {
      // try next endpoint
    }
  }

  // Fallback: data URL. Works for fal Veo image-to-video on most endpoints.
  const b64 = buf.toString("base64");
  return `data:${contentType};base64,${b64}`;
}

function pickUrl(obj: Record<string, unknown>): string | null {
  // Try the documented field first, then fall back to common alternatives,
  // then scan for any string value that looks like a URL.
  const direct = obj.url ?? obj.access_url ?? obj.file_url ?? obj.public_url;
  if (typeof direct === "string" && direct.startsWith("http")) return direct;
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  return null;
}
