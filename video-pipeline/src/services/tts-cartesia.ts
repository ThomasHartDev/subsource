// TODO: switch to Cartesia SSE for accurate word timestamps; current implementation distributes evenly.
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AdScript } from "../types";
import type { SceneAudio } from "./tts-edge";
import { getAudioDuration } from "./audio-meta";

// Generate exact-duration silent MP3 for VO-less scenes (bait, interrupt).
async function writeSilentMp3(outPath: string, durationSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(Math.max(0.1, durationSec)), "-q:a", "9", outPath],
      { stdio: "ignore" },
    );
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code} writing silent ${outPath}`))));
    ff.on("error", reject);
  });
}

// Hard-coded default voice. Swap as needed; pulled from Cartesia stock voices.
const CARTESIA_VOICE_ID = "694f9389-aac1-45b6-b726-9d9369183238";

// Same three styles as the other TTS services. Cartesia voice IDs.
// Keeping all three pointed at the default for now — user can split them later.
const VOICE_MAP: Record<AdScript["voiceStyle"], string> = {
  "confident-warm": CARTESIA_VOICE_ID,
  "energetic-young": CARTESIA_VOICE_ID,
  "calm-pro": CARTESIA_VOICE_ID,
};

const CARTESIA_URL = "https://api.cartesia.ai/tts/bytes";

export type WordTimestamps = {
  words: string[];
  starts: number[];
  ends: number[];
};

async function ttsRequest(apiKey: string, voiceId: string, text: string): Promise<Buffer> {
  const body = JSON.stringify({
    model_id: "sonic-3",
    voice: { mode: "id", id: voiceId },
    transcript: text,
    output_format: {
      container: "mp3",
      encoding: "mp3",
      sample_rate: 44100,
      bit_rate: 128000,
    },
    language: "en",
  });

  const res = await fetch(CARTESIA_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2026-03-01",
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "<no body>");
    const err = new Error(`Cartesia TTS failed: ${res.status} ${errText}`);
    // Tag for retry decision
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Cartesia TTS returned empty body");
  return buf;
}

async function ttsWithRetry(apiKey: string, voiceId: string, text: string): Promise<Buffer> {
  try {
    return await ttsRequest(apiKey, voiceId, text);
  } catch (e) {
    const status = (e as Error & { status?: number }).status;
    if (status && status >= 500 && status < 600) {
      await new Promise((r) => setTimeout(r, 2000));
      return await ttsRequest(apiKey, voiceId, text);
    }
    throw e;
  }
}

// Even-distribution timestamp estimator. Splits the audio duration into N equal
// slices, one per word. Imperfect but good enough for kinetic captions until we
// wire up Cartesia's SSE word_timestamps stream.
function estimateTimestamps(text: string, durationSec: number): WordTimestamps {
  const words = text.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 0);
  if (words.length === 0) {
    return { words: [], starts: [], ends: [] };
  }
  const step = durationSec / words.length;
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < words.length; i++) {
    starts.push(Number((i * step).toFixed(3)));
    ends.push(Number(((i + 1) * step).toFixed(3)));
  }
  return { words, starts, ends };
}

export async function synthesizeScenes(
  script: AdScript,
  outDir: string,
): Promise<SceneAudio[]> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CARTESIA_API_KEY missing — set it in C:\\Users\\Thomas\\Desktop\\Test\\.env",
    );
  }
  await fs.mkdir(outDir, { recursive: true });

  const voiceId = VOICE_MAP[script.voiceStyle];
  const out: SceneAudio[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]!;
    const sceneDir = path.join(outDir, `scene-${i}`);
    await fs.mkdir(sceneDir, { recursive: true });
    const audioPath = path.join(sceneDir, "audio.mp3");

    // VO-less scenes (bait, interrupt) get a silent MP3 of their declared duration.
    // Cartesia 400s on empty transcripts; this preserves timeline math without the call.
    const vo = (scene.voiceover ?? "").trim();
    if (vo === "") {
      await writeSilentMp3(audioPath, scene.durationSec || 1);
      out.push({ sceneIndex: i, audioPath, timestampsPath: undefined });
      continue;
    }

    const buf = await ttsWithRetry(apiKey, voiceId, vo);
    await fs.writeFile(audioPath, buf);

    // Measure the audio we just wrote and synthesize even-distribution timestamps.
    let timestampsPath: string | undefined;
    try {
      const durationSec = await getAudioDuration(audioPath);
      const ts = estimateTimestamps(scene.voiceover, durationSec);
      const tsPath = path.join(sceneDir, "audio.timestamps.json");
      await fs.writeFile(tsPath, JSON.stringify(ts));
      timestampsPath = tsPath;
    } catch (e) {
      // If ffprobe is missing or the audio is unreadable, skip timestamps for
      // this scene rather than failing the whole render. Captions will simply
      // not render for scenes with no timestamps file.
      console.warn(
        `[cartesia] could not measure audio duration for scene ${i}, skipping timestamps: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    out.push({ sceneIndex: i, audioPath, timestampsPath });
  }

  return out;
}
