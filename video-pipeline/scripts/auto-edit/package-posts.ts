// Take the rendered vertical + landscape clips and produce a per-platform
// delivery folder: each platform's file remuxed to its spec (faststart, codec,
// duration/size sanity-checked against platform-specs.json) plus a post.md with
// a caption + hashtags per platform. This is the "export" half of hybrid
// posting (covers TikTok + LinkedIn, which need manual upload) and the staging
// step for the auto-post adapters (PR3).
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run, probeDuration } from "./ffmpeg";
import { getPlatformSpec, type PlatformSpec } from "../../src/types";
import {
  TARGETS,
  LANE_LABELS,
  captionFor,
  stubCaptions,
  type Orientation,
  type Target,
  type Captions,
} from "./targets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
}

// Run a command and capture stdout (used to shell out to the claude CLI).
function runCapture(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 400)}`));
    });
  });
}

async function transcriptText(opts: { transcript?: string; text?: string }): Promise<string> {
  if (opts.text) return opts.text;
  if (opts.transcript) {
    const raw = JSON.parse(await fs.readFile(opts.transcript, "utf8")) as
      | { words?: { word: string }[] }
      | { word: string }[];
    const words = Array.isArray(raw) ? raw : (raw.words ?? []);
    return words.map((w) => w.word).join(" ").replace(/\s+([.,!?])/g, "$1").trim();
  }
  return "";
}

// Ask the claude CLI (not the API — house rule) for platform-tuned captions.
// The voice rules mirror ~/.claude/CLAUDE.md: casual, no AI tells, no em dashes,
// no "X, not Y" antithesis, no fake hype.
async function generateCaptions(transcript: string, topic: string): Promise<Captions> {
  const prompt = `You are writing social captions for Thomas, a senior dev posting creator content. Voice: casual, confident, concrete, first person. Hard rules: NO em dashes, NO "X not Y" / "not just X but Y" antithesis, NO hashtag-stuffing, NO corporate/AI words (leverage, robust, cutting-edge, comprehensive), NO fake hype. Hooks are short and specific.

Topic: ${topic || "(infer from transcript)"}
Transcript of the video:
"""
${transcript.slice(0, 2500)}
"""

Return ONLY a JSON object, no prose, no code fences, with this exact shape:
{
  "punchy": { "caption": "1-2 line hook for TikTok/Reels/Shorts", "hashtags": ["5-7 lowercase tags relevant to the topic"] },
  "youtube": { "title": "<70 char title", "description": "2-3 sentence description", "hashtags": ["3-5 tags"] },
  "professional": { "caption": "3-5 sentence LinkedIn post, still casual, one concrete takeaway", "hashtags": ["3-5 tags"] },
  "short": { "caption": "tweet under 270 chars" },
  "casual": { "caption": "2-3 sentence Facebook caption", "hashtags": ["3-5 tags"] }
}`;
  const raw = await runCapture("claude", ["-p", prompt], 120_000);
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) throw new Error(`no JSON in claude output: ${raw.slice(0, 200)}`);
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Captions;
}

// Remux a rendered file to a platform's spec. Same-dims source (the common case
// for talking head) is a stream copy + faststart; only a dims mismatch triggers
// a scale+pad re-encode. Returns the output path + a compliance note.
async function packageForPlatform(
  src: string,
  spec: PlatformSpec,
  outFile: string,
): Promise<{ note: string; durationSec: number; sizeMb: number }> {
  const srcDur = await probeDuration(src);
  const sameAspect = true; // src is already vertical(1080x1920) or landscape(1920x1080)
  const args = sameAspect
    ? ["-y", "-i", src, "-c:v", "copy", "-c:a", "aac", "-b:a", `${spec.preferred_audio_bitrate_kbps}k`, "-movflags", "+faststart", outFile]
    : [
        "-y", "-i", src,
        "-vf", `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease,pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", `${spec.preferred_audio_bitrate_kbps}k`, "-movflags", "+faststart", outFile,
      ];
  await run("ffmpeg", args, `package-${spec.label}`);
  const stat = await fs.stat(outFile);
  const sizeMb = stat.size / (1024 * 1024);
  const notes: string[] = [];
  if (srcDur > spec.max_duration_sec) notes.push(`⚠ ${srcDur.toFixed(0)}s exceeds ${spec.label} max ${spec.max_duration_sec}s — trim before posting`);
  if (sizeMb > spec.max_file_mb) notes.push(`⚠ ${sizeMb.toFixed(0)}MB exceeds ${spec.label} cap ${spec.max_file_mb}MB`);
  return { note: notes.join("; ") || "ok", durationSec: srcDur, sizeMb };
}

async function main() {
  const argv = process.argv;
  const vertical = flag(argv, "--vertical");
  const landscape = flag(argv, "--landscape");
  const topic = flag(argv, "--topic") ?? "";
  const slug = flag(argv, "--slug") ?? "post";
  const noAi = argv.includes("--no-ai");
  const transcript = flag(argv, "--transcript");
  const text = flag(argv, "--transcript-text");

  if (!vertical && !landscape) {
    console.error("usage: package-posts.ts --vertical <mp4> --landscape <mp4> --topic <str> [--transcript words.json | --transcript-text str] [--slug name] [--no-ai]");
    process.exit(2);
  }
  const sources: Record<Orientation, string | undefined> = {
    vertical: vertical ? path.resolve(vertical) : undefined,
    landscape: landscape ? path.resolve(landscape) : undefined,
  };

  const deliveryDir = path.join(ROOT, "out", `${slug}-delivery`);
  await fs.mkdir(deliveryDir, { recursive: true });

  // Captions: AI via claude CLI, or a deterministic stub with --no-ai.
  let captions: Captions;
  if (noAi) {
    captions = stubCaptions(topic);
    console.log("[package] using stub captions (--no-ai)");
  } else {
    const tx = await transcriptText({ transcript, text });
    console.log("[package] generating captions via claude CLI...");
    try {
      captions = await generateCaptions(tx, topic);
    } catch (e) {
      console.warn(`[package] caption generation failed (${(e as Error).message}); falling back to stub`);
      captions = stubCaptions(topic);
    }
  }

  // Package each target whose source orientation was provided.
  const rows: { target: Target; file: string; note: string; cap: { body: string; hashtags: string[] } }[] = [];
  for (const target of TARGETS) {
    const src = sources[target.orientation];
    if (!src) {
      console.log(`[package] skip ${target.label} (no ${target.orientation} source)`);
      continue;
    }
    const spec = getPlatformSpec(target.specId);
    const outFile = path.join(deliveryDir, `${target.key}.mp4`);
    const { note } = await packageForPlatform(src, spec, outFile);
    rows.push({ target, file: path.basename(outFile), note, cap: captionFor(target.style, captions) });
    console.log(`[package] ${target.label} -> ${path.basename(outFile)} (${note})`);
  }

  // post.md — one section per platform with the file, caption, hashtags, and
  // how it ships (auto-post lane or manual upload). Run post-delivery.ts against
  // this folder to fire the auto-post lanes; manual lanes you upload yourself.
  let md = `# Post package: ${topic || slug}\n\nGenerated ${rows.length} platform file(s) in this folder.\n\n`;
  for (const r of rows) {
    const tags = r.cap.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    md += `## ${r.target.label}\n`;
    md += `- File: \`${r.file}\` (${getPlatformSpec(r.target.specId).aspect}, ${LANE_LABELS[r.target.lane]})\n`;
    if (r.note !== "ok") md += `- ${r.note}\n`;
    md += `\n**Caption**\n\n${r.cap.body}\n\n`;
    if (tags) md += `${tags}\n\n`;
  }
  await fs.writeFile(path.join(deliveryDir, "post.md"), md);
  await fs.writeFile(path.join(deliveryDir, "captions.json"), JSON.stringify(captions, null, 2));

  console.log(`\n[package] done -> ${deliveryDir}`);
  console.log(`[package] ${rows.length} files + post.md + captions.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
