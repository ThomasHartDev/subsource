import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

// Re-encode a Veo MP4 to a clean Chromium-decodable form. Veo occasionally
// emits frames Chromium's decoder rejects (PIPELINE_ERROR_DECODE), which then
// crashes Remotion. ffmpeg passthrough copy doesn't fix this; we have to
// re-encode the video stream.
async function normalizeForRemotion(srcPath: string): Promise<void> {
  const tmpPath = srcPath + ".tmp.mp4";
  await new Promise<void>((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      [
        "-y",
        "-i", srcPath,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-profile:v", "main",
        "-movflags", "+faststart",
        "-c:a", "copy",
        tmpPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    ff.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg normalize failed (${code}): ${stderr.slice(-400)}`));
    });
  });
  await fs.rename(tmpPath, srcPath);
}

// Veo charges on QUEUE ACCEPTANCE, not completion. Cancelling after IN_PROGRESS
// does NOT refund, so validate everything locally before the POST.
//
// Cost (Apr 2026, no audio):
//   veo3.1-fast 8s = $0.50
//   veo3 (full)  8s = $2.50
// Image-to-video is the same price as text-to-video for both models.

export type VeoModel = "veo3.1-fast" | "veo3";
export type VeoDuration = "4s" | "6s" | "8s";

export interface VeoOptions {
  model?: VeoModel;
  duration?: VeoDuration;
  aspectRatio?: "9:16" | "16:9";
  generateAudio?: boolean;
  initImageUrl?: string;
}

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 4 * 60 * 1000;

type SubmitResponse = {
  status: string;
  request_id: string;
  response_url: string;
  status_url: string;
  cancel_url: string;
};

type StatusResponse = {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string;
};

type FinalResponse = {
  video?: { url?: string; duration?: number };
};

function endpointFor(model: VeoModel, hasInitImage: boolean): string {
  // fal.ai endpoint conventions per their queue docs:
  //   text-to-video uses the model base path
  //   image-to-video uses /<model>/image-to-video subpath
  const base =
    model === "veo3.1-fast"
      ? "https://queue.fal.run/fal-ai/veo3.1/fast"
      : "https://queue.fal.run/fal-ai/veo3";
  return hasInitImage ? `${base}/image-to-video` : base;
}

export async function generateVeoClip(
  prompt: string,
  outDir: string,
  opts: VeoOptions = {},
): Promise<{ clipPath: string; durationSec: number }> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error("generateVeoClip: prompt is empty");
  }
  // outDir must already exist — caller controls render layout
  const outDirStat = await fs.stat(outDir).catch(() => null);
  if (!outDirStat || !outDirStat.isDirectory()) {
    throw new Error(`generateVeoClip: outDir does not exist: ${outDir}`);
  }

  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not set");

  const model: VeoModel = opts.model ?? "veo3.1-fast";
  const duration: VeoDuration = opts.duration ?? "8s";
  const aspectRatio = opts.aspectRatio ?? "9:16";
  const generateAudio = opts.generateAudio ?? false;
  const initImageUrl = opts.initImageUrl;

  const submitUrl = endpointFor(model, Boolean(initImageUrl));

  const body: Record<string, unknown> = {
    prompt: prompt.trim(),
    aspect_ratio: aspectRatio,
    duration,
    generate_audio: generateAudio,
  };
  if (initImageUrl) {
    body.image_url = initImageUrl;
  }

  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!submitRes.ok) {
    throw new Error(`fal submit failed: ${submitRes.status} ${await submitRes.text()}`);
  }
  const submitted = (await submitRes.json()) as SubmitResponse;
  if (!submitted.status_url || !submitted.response_url) {
    throw new Error(`fal submit returned malformed body: ${JSON.stringify(submitted)}`);
  }

  // Poll until COMPLETED, FAILED, or timeout. We're on the meter from this
  // point so don't bail early without trying to cancel.
  const start = Date.now();
  while (true) {
    if (Date.now() - start > MAX_WAIT_MS) {
      await cancelQuietly(submitted.cancel_url, apiKey);
      throw new Error("fal generation timed out after 4 min");
    }
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await fetch(submitted.status_url, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!statusRes.ok) {
      throw new Error(`fal status poll failed: ${statusRes.status} ${await statusRes.text()}`);
    }
    const status = (await statusRes.json()) as StatusResponse;
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED") {
      throw new Error(`fal generation failed: ${JSON.stringify(status)}`);
    }
    // IN_QUEUE or IN_PROGRESS — keep polling
  }

  const finalRes = await fetch(submitted.response_url, {
    headers: { Authorization: `Key ${apiKey}` },
  });
  if (!finalRes.ok) {
    throw new Error(`fal final fetch failed: ${finalRes.status} ${await finalRes.text()}`);
  }
  const final = (await finalRes.json()) as FinalResponse;
  const videoUrl = final.video?.url;
  if (!videoUrl) {
    throw new Error(`fal final response missing video.url: ${JSON.stringify(final)}`);
  }

  const clipPath = path.join(outDir, "hero.mp4");
  const dl = await fetch(videoUrl);
  if (!dl.ok) throw new Error(`fal CDN download failed: ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  await fs.writeFile(clipPath, buf);

  // Normalize for Remotion's Chromium decoder — Veo MP4s sometimes have frames
  // that crash decode. Cheap to re-encode 8s clips.
  await normalizeForRemotion(clipPath);

  const fallbackDuration = duration === "4s" ? 4 : duration === "6s" ? 6 : 8;
  const durationSec =
    typeof final.video?.duration === "number" ? final.video.duration : fallbackDuration;
  return { clipPath, durationSec };
}

// Backwards-compat wrapper. Keeps the original Veo 3.1 Fast 6s 16:9 no-audio
// behavior so existing v3 render.ts callers don't change.
export async function generateHeroClip(
  prompt: string,
  outDir: string,
): Promise<{ clipPath: string; durationSec: number }> {
  return generateVeoClip(prompt, outDir, {
    model: "veo3.1-fast",
    duration: "6s",
    aspectRatio: "16:9",
    generateAudio: false,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function cancelQuietly(url: string, apiKey: string): Promise<void> {
  try {
    await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Key ${apiKey}` },
    });
  } catch {
    // best effort — already over the timeout, nothing to do
  }
}
