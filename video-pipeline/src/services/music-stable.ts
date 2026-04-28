// Stable Audio 2.5 via Replicate — fallback for Suno when GoAPI is down.
// Cost: $0.20 / run (Apr 2026). Timing: ~30-60s for a 30s clip.
// Auth header is `Authorization: Token <key>` (NOT Bearer).
// Model latest_version is fetched once at module load — Replicate occasionally
// promotes a new version and stale ids return 422 on /predictions.
import fs from "node:fs/promises";
import path from "node:path";

const MODEL_OWNER = "stability-ai";
const MODEL_NAME = "stable-audio-2.5";
const MODEL_GET_URL = `https://api.replicate.com/v1/models/${MODEL_OWNER}/${MODEL_NAME}`;
const PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";
const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 4 * 60 * 1000;
const DEFAULT_DURATION_SEC = 30;

let cachedVersionId: string | null = null;

interface PredictionResponse {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls?: {
    get?: string;
    cancel?: string;
  };
}

async function getLatestVersionId(apiKey: string): Promise<string> {
  if (cachedVersionId) return cachedVersionId;
  const res = await fetch(MODEL_GET_URL, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Replicate model lookup failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { latest_version?: { id?: string } };
  const id = body.latest_version?.id;
  if (!id) {
    throw new Error(`Replicate ${MODEL_OWNER}/${MODEL_NAME} returned no latest_version.id`);
  }
  cachedVersionId = id;
  return id;
}

async function createPrediction(
  apiKey: string,
  versionId: string,
  prompt: string,
): Promise<PredictionResponse> {
  const res = await fetch(PREDICTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: versionId,
      input: {
        prompt,
        duration: DEFAULT_DURATION_SEC,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Replicate predictions create failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PredictionResponse;
}

async function pollPrediction(apiKey: string, getUrl: string): Promise<PredictionResponse> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(getUrl, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (!res.ok) {
      // transient — keep polling unless it's a hard 4xx other than 429
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`Replicate poll failed: ${res.status} ${await res.text()}`);
      }
      continue;
    }
    const body = (await res.json()) as PredictionResponse;
    if (body.status === "succeeded") return body;
    if (body.status === "failed" || body.status === "canceled") {
      throw new Error(`Stable Audio prediction ${body.id} ${body.status}: ${body.error ?? "no error message"}`);
    }
  }
  throw new Error(`Stable Audio prediction timed out after ${MAX_WAIT_MS / 1000}s`);
}

function extractOutputUrl(out: PredictionResponse["output"]): string {
  if (typeof out === "string" && out.length > 0) return out;
  if (Array.isArray(out) && out.length > 0 && typeof out[0] === "string") return out[0];
  throw new Error(`Stable Audio prediction succeeded but output is empty: ${JSON.stringify(out)}`);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Stable Audio file: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Stable Audio download returned empty body");
  await fs.writeFile(dest, buf);
}

export async function generateMusic(
  prompt: string,
  outDir: string,
): Promise<{ musicPath: string; durationSec: number }> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error("generateMusic: prompt must be non-empty");
  }
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) {
    throw new Error("REPLICATE_API_KEY missing — set it in C:\\Users\\Thomas\\Desktop\\Test\\.env");
  }
  const stat = await fs.stat(outDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`generateMusic: outDir does not exist: ${outDir}`);
  }

  const versionId = await getLatestVersionId(apiKey);
  const created = await createPrediction(apiKey, versionId, prompt.trim());
  const getUrl = created.urls?.get;
  if (!getUrl) {
    throw new Error(`Replicate predictions create returned no urls.get: ${JSON.stringify(created)}`);
  }
  const finished = await pollPrediction(apiKey, getUrl);
  const audioUrl = extractOutputUrl(finished.output);
  // Output URL ends in .mp3 today; pin to mp3 to match downstream Remotion expectation.
  const musicPath = path.resolve(outDir, "music.mp3");
  await downloadFile(audioUrl, musicPath);
  return { musicPath, durationSec: DEFAULT_DURATION_SEC };
}
