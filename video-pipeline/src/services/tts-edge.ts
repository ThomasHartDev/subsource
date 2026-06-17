import fs from "node:fs/promises";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { AdScript } from "../types";

const VOICE_MAP: Record<AdScript["voiceStyle"], string> = {
  "confident-warm": "en-US-DavisNeural",
  "energetic-young": "en-US-AriaNeural",
  "calm-pro": "en-US-GuyNeural",
};

export type SceneAudio = { sceneIndex: number; audioPath: string; timestampsPath?: string };

export async function synthesizeScenes(
  script: AdScript,
  outDir: string,
): Promise<SceneAudio[]> {
  await fs.mkdir(outDir, { recursive: true });
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE_MAP[script.voiceStyle], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const out: SceneAudio[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]!;
    const sceneDir = path.join(outDir, `scene-${i}`);
    await fs.mkdir(sceneDir, { recursive: true });
    const result = await tts.toFile(sceneDir, scene.voiceover);
    out.push({ sceneIndex: i, audioPath: result.audioFilePath });
  }
  tts.close();
  return out;
}
