import fs from "node:fs/promises";
import path from "node:path";
import type { AdScript } from "../types";
import type { SceneAudio } from "./tts-edge";

const VOICE_MAP: Record<AdScript["voiceStyle"], string> = {
  "confident-warm": "ErXwobaYiN019PkySvjV", // Antoni
  "energetic-young": "21m00Tcm4TlvDq8ikWAM", // Rachel
  "calm-pro": "VR6AewLTigWG4xSOukaG", // Arnold
};

export async function synthesizeScenes(
  script: AdScript,
  outDir: string,
): Promise<SceneAudio[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  await fs.mkdir(outDir, { recursive: true });

  const voiceId = VOICE_MAP[script.voiceStyle];
  const out: SceneAudio[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]!;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: scene.voiceover,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );
    if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const audioPath = path.join(outDir, `scene-${i}.mp3`);
    await fs.writeFile(audioPath, buf);
    out.push({ sceneIndex: i, audioPath });
  }
  return out;
}
