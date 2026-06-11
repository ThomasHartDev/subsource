// Resolved endpoint via probe of api.goapi.ai unified task endpoint (Apr 2026):
//   POST https://api.goapi.ai/api/v1/task        body: { model: "suno", task_type: "music", input: { gpt_description_prompt, make_instrumental } }
//   GET  https://api.goapi.ai/api/v1/task/{id}
// Auth header: X-API-Key.
// The /api/suno/v1/music path from the github.com/Goapiai/Suno-API README is stale (returns 404).
// All GoAPI services share /api/v1/task — model + task_type discriminate.
//
// $0.02 per generation (Apr 2026, instrumental). Suno reseller — endpoint paths can shift,
// check docs if calls 404.
import fs from "node:fs/promises";
import path from "node:path";

const TASK_CREATE_URL = "https://api.goapi.ai/api/v1/task";
const TASK_GET_URL = "https://api.goapi.ai/api/v1/task";
const POLL_INTERVAL_MS = 7_000;
const MAX_WAIT_MS = 4 * 60 * 1000;
const DEFAULT_DURATION_SEC = 120;

// GoAPI response envelope for create + status. Audio URL location varies across
// versions of the reseller's API — we probe several shapes.
interface GoApiEnvelope {
  code?: number;
  message?: string;
  data?: unknown;
}

interface CreateData {
  task_id?: string;
  taskId?: string;
}

function readString(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function readNumber(obj: unknown, key: string): number | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

// Audio URL might be at: data.clips[0].audio_url, data.audio_url, clips[0].audio_url,
// or top-level audio_url. Same for status field. Probe in order.
function extractAudio(env: GoApiEnvelope): { audioUrl?: string; durationSec?: number } {
  const candidates: unknown[] = [env.data, env];
  for (const root of candidates) {
    if (!root || typeof root !== "object") continue;
    const directUrl = readString(root, "audio_url");
    if (directUrl) {
      return { audioUrl: directUrl, durationSec: readNumber(root, "duration") };
    }
    // mid-2026 GoAPI shape: data.output[] with one entry per generated clip;
    // take the longest so downstream trims instead of running dry
    const output = (root as Record<string, unknown>).output;
    if (Array.isArray(output) && output.length > 0) {
      let best: { url: string; dur: number } | null = null;
      for (const clip of output) {
        if (!clip || typeof clip !== "object") continue;
        const url = readString(clip, "audio_url");
        if (!url) continue;
        const meta = (clip as Record<string, unknown>).metadata;
        const dur =
          (meta && typeof meta === "object" ? readNumber(meta, "duration") : undefined) ?? 0;
        if (!best || dur > best.dur) best = { url, dur };
      }
      if (best) {
        return { audioUrl: best.url, durationSec: best.dur || undefined };
      }
    }
    const clips = (root as Record<string, unknown>).clips;
    if (Array.isArray(clips) && clips.length > 0) {
      const first = clips[0];
      const url = readString(first, "audio_url");
      if (url) {
        return { audioUrl: url, durationSec: readNumber(first, "duration") };
      }
    }
  }
  return {};
}

function extractStatus(env: GoApiEnvelope): string | undefined {
  const roots: unknown[] = [env.data, env];
  for (const root of roots) {
    const s = readString(root, "status");
    if (s) return s.toLowerCase();
  }
  return undefined;
}

function isDoneStatus(status: string | undefined): boolean {
  if (!status) return false;
  return status === "completed" || status === "complete" || status === "succeeded" || status === "success" || status === "finished";
}

function isFailedStatus(status: string | undefined): boolean {
  if (!status) return false;
  return status === "failed" || status === "error";
}

async function createTask(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(TASK_CREATE_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "suno",
      task_type: "music",
      input: {
        gpt_description_prompt: prompt,
        make_instrumental: true,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`GoAPI Suno create failed: ${res.status} ${await res.text()}`);
  }
  const env = (await res.json()) as GoApiEnvelope;
  const data = (env.data ?? {}) as CreateData;
  const taskId = data.task_id ?? data.taskId;
  if (!taskId) throw new Error(`GoAPI Suno create returned no task_id: ${JSON.stringify(env)}`);
  return taskId;
}

async function pollTask(apiKey: string, taskId: string): Promise<{ audioUrl: string; durationSec: number }> {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${TASK_GET_URL}/${encodeURIComponent(taskId)}`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) {
      // transient — keep polling unless it's a hard 4xx other than 429
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`GoAPI Suno poll failed: ${res.status} ${await res.text()}`);
      }
      continue;
    }
    const env = (await res.json()) as GoApiEnvelope;
    const status = extractStatus(env);
    if (isFailedStatus(status)) {
      throw new Error(`Suno task ${taskId} failed: ${JSON.stringify(env)}`);
    }
    if (isDoneStatus(status)) {
      const { audioUrl, durationSec } = extractAudio(env);
      if (!audioUrl) {
        throw new Error(`Suno task ${taskId} done but no audio_url: ${JSON.stringify(env)}`);
      }
      return { audioUrl, durationSec: durationSec ?? DEFAULT_DURATION_SEC };
    }
    // Some shapes omit a status field but still expose audio_url once finished
    const { audioUrl, durationSec } = extractAudio(env);
    if (audioUrl) return { audioUrl, durationSec: durationSec ?? DEFAULT_DURATION_SEC };
  }
  throw new Error(`Suno task ${taskId} timed out after ${MAX_WAIT_MS / 1000}s`);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Suno MP3: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Suno MP3 download returned empty body");
  await fs.writeFile(dest, buf);
}

export async function generateMusic(
  prompt: string,
  outDir: string,
): Promise<{ musicPath: string; durationSec: number }> {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error("generateMusic: prompt must be non-empty");
  }
  const apiKey = process.env.GOAPI_KEY;
  if (!apiKey) {
    throw new Error("GOAPI_KEY missing — set it in C:\\Users\\Thomas\\Desktop\\Test\\.env");
  }
  const stat = await fs.stat(outDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`generateMusic: outDir does not exist: ${outDir}`);
  }

  const taskId = await createTask(apiKey, prompt.trim());
  const { audioUrl, durationSec } = await pollTask(apiKey, taskId);
  const musicPath = path.resolve(outDir, "music.mp3");
  await downloadFile(audioUrl, musicPath);
  return { musicPath, durationSec };
}
