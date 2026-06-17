// Build a synthetic talking-head test clip: TTS lines (with filler words)
// joined by deliberate silence gaps, over a plain vertical background. Used to
// validate that the auto-editor removes silence + filler and syncs captions.
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const LINES = [
  "Hey everyone, um, welcome back to the channel.",
  "Today I want to show you, uh, something pretty cool.",
  "I built a tool that edits my talking videos automatically.",
  "It cuts the dead silence, adds captions, and, um, makes it look clean.",
];
const GAP_SEC = 1.6;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited ${c}`))));
  });
}

async function main() {
  const tmp = path.join(os.tmpdir(), `ae-test-${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata("en-US-AndrewNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const lineFiles: string[] = [];
  for (let i = 0; i < LINES.length; i++) {
    const dir = path.join(tmp, `l${i}`);
    await fs.mkdir(dir, { recursive: true });
    const r = await tts.toFile(dir, LINES[i]!);
    lineFiles.push(r.audioFilePath);
  }
  tts.close();

  // 1.6s of silence between lines, same codec as the TTS mp3s.
  const sil = path.join(tmp, "sil.mp3");
  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `anullsrc=r=24000:cl=mono`,
    "-t", String(GAP_SEC), "-c:a", "libmp3lame", "-b:a", "48k", sil,
  ]);

  // Interleave line, silence, line, silence, ...
  const audioInputs: string[] = [];
  for (let i = 0; i < lineFiles.length; i++) {
    audioInputs.push(lineFiles[i]!);
    if (i < lineFiles.length - 1) audioInputs.push(sil);
  }

  const inputArgs: string[] = [];
  audioInputs.forEach((f) => inputArgs.push("-i", f));
  const concatIn = audioInputs.map((_, i) => `[${i + 1}:a]`).join("");
  const filter = `${concatIn}concat=n=${audioInputs.length}:v=0:a=1[a]`;

  await fs.mkdir(path.join(ROOT, "public", "auto-edit"), { recursive: true });
  const out = path.join(ROOT, "public", "auto-edit", "test-talking.mp4");
  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "color=c=0x0b0f17:s=1080x1920:r=30",
    ...inputArgs,
    "-filter_complex", filter,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
    "-shortest", out,
  ]);
  console.log(`[make-test-clip] wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
