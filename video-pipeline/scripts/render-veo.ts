import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { generateBrief, type CreativeBrief } from "../src/services/creative-brief";
import { generateVeoClip, type VeoModel } from "../src/services/ai-clip-fal";
import { extractLastFrame, uploadToFalStorage } from "../src/services/video-utils";
import { synthesizeScenes as cartesiaTts } from "../src/services/tts-cartesia";
import { ProfileBuilder, writeProfile, sha256OfFile } from "../src/services/profile";
import {
  getPlatformSpec,
  type AppConcept,
  type PlatformId,
  type ProfileScene,
  type AdScript,
} from "../src/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const COMPARISON_DIR = path.join(ROOT, "out", "v4-veo-comparison");

type VeoTest = "a" | "b" | "c";

const LINKEDITCH: AppConcept = {
  name: "Linkeditch",
  oneLiner: "AI applies to every remote SWE job with a custom cover letter. While you sleep.",
  audience: "Software engineers job-hunting in 2026, especially remote-only roles",
  pain: "Spending 3 hours a day rewriting cover letters for 47 LinkedIn easy-applies. Hearing back from 2.",
  outcome:
    "Linkeditch reads each job, writes a unique cover letter, fills the whole application, and stops one click before submit so you can review. Apply to 50 jobs in the time it takes to send 5 manually.",
  humor: "self-aware",
  hookTemplate: "fake-satisfying",
};

function testConfig(test: VeoTest): { numShots: 1 | 2; model: VeoModel; costPerCallUsd: number; label: string } {
  switch (test) {
    case "a":
      return { numShots: 1, model: "veo3.1-fast", costPerCallUsd: 0.5, label: "1-shot Veo 3.1 Fast 8s" };
    case "b":
      // Two 4s clips at half-cost each. fal docs price 4s at half the 8s rate.
      return { numShots: 2, model: "veo3.1-fast", costPerCallUsd: 0.25, label: "2-shot Veo 3.1 Fast chain (4s + 4s)" };
    case "c":
      return { numShots: 1, model: "veo3", costPerCallUsd: 2.5, label: "1-shot Veo 3 (full) 8s" };
  }
}

// Cache briefs across all 3 tests so A and C share identical content. We only
// need two variants (1-shot and 2-shot) — A and C reuse 1-shot, B uses 2-shot.
async function loadOrCreateBrief(numShots: 1 | 2): Promise<CreativeBrief> {
  await fs.mkdir(COMPARISON_DIR, { recursive: true });
  const briefPath = path.join(COMPARISON_DIR, `brief-${numShots}shot.json`);
  try {
    const raw = await fs.readFile(briefPath, "utf8");
    const cached = JSON.parse(raw) as CreativeBrief;
    console.log(`[brief] loaded cached ${numShots}-shot brief`);
    return cached;
  } catch {
    console.log(`[brief] generating fresh ${numShots}-shot brief via claude...`);
    const fresh = await generateBrief(LINKEDITCH, { numShots, targetDurationSec: 8 });
    await fs.writeFile(briefPath, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

// Adapt the CreativeBrief into the AdScript shape that tts-cartesia expects so
// we can reuse the existing per-scene synth path verbatim.
function briefToAdScript(brief: CreativeBrief): AdScript {
  return {
    appName: LINKEDITCH.name,
    tagline: brief.tagline,
    voiceStyle: "confident-warm",
    // Pad to 4 scenes minimum (AdScript schema requires min 4). Extra entries
    // get empty voiceovers so cartesia writes silent placeholders we ignore.
    scenes: padScenes(
      brief.shots.map((s) => ({
        kind: "feature" as const,
        headline: s.onScreenText ?? brief.tagline,
        voiceover: s.voiceover,
        durationSec: Math.max(0.1, Math.min(8, s.durationSec)),
      })),
    ),
  };
}

function padScenes<T extends { kind: "feature"; headline: string; voiceover: string; durationSec: number }>(scenes: T[]): T[] {
  const out: T[] = [...scenes];
  while (out.length < 4) {
    out.push({ kind: "feature", headline: "", voiceover: "", durationSec: 0.1 } as T);
  }
  return out;
}

async function ensureShotPath(rawPath: string, publicDir: string, index: number): Promise<void> {
  const target = path.join(publicDir, `shot-${index}.mp4`);
  if (path.resolve(rawPath) === path.resolve(target)) return;
  await fs.copyFile(rawPath, target);
  // Drop the source file so we don't confuse the bundle with stray hero.mp4s.
  await fs.unlink(rawPath).catch(() => {});
}

async function callVeo(
  prompt: string,
  publicDir: string,
  index: number,
  duration: "4s" | "8s",
  model: VeoModel,
  costUsd: number,
  builder: ProfileBuilder,
  initImageUrl?: string,
): Promise<void> {
  const t0 = Date.now();
  const result = await generateVeoClip(prompt, publicDir, {
    model,
    duration,
    aspectRatio: "9:16",
    generateAudio: false,
    ...(initImageUrl ? { initImageUrl } : {}),
  });
  builder.recordExternalCall({
    service: "fal-veo",
    duration_ms: Date.now() - t0,
    cost_usd: costUsd,
    ok: true,
    error: null,
  });
  console.log(`[veo] shot ${index} ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await ensureShotPath(result.clipPath, publicDir, index);
}

async function generateClips(
  test: VeoTest,
  brief: CreativeBrief,
  publicDir: string,
  builder: ProfileBuilder,
): Promise<void> {
  const cfg = testConfig(test);

  if (test === "a" || test === "c") {
    const shot = brief.shots[0];
    if (!shot) throw new Error("brief has no shots");
    await callVeo(shot.veoPrompt, publicDir, 0, "8s", cfg.model, cfg.costPerCallUsd, builder);
    return;
  }

  // Test B: 2 chained 4s shots, image-to-video for shot 2.
  const shot0 = brief.shots[0];
  const shot1 = brief.shots[1];
  if (!shot0 || !shot1) throw new Error("test B brief must have 2 shots");
  await callVeo(shot0.veoPrompt, publicDir, 0, "4s", cfg.model, cfg.costPerCallUsd, builder);

  // Extract the last frame of shot 0, upload it, feed it into shot 1.
  const lastFramePath = await extractLastFrame(path.join(publicDir, "shot-0.mp4"));
  const initImageUrl = await uploadToFalStorage(lastFramePath);
  console.log(`[veo:b] last frame uploaded -> ${initImageUrl}`);
  await callVeo(shot1.veoPrompt, publicDir, 1, "4s", cfg.model, cfg.costPerCallUsd, builder, initImageUrl);
}

async function main() {
  const test = process.argv[2] as VeoTest | undefined;
  if (!test || !["a", "b", "c"].includes(test)) {
    console.error("Usage: pnpm tsx scripts/render-veo.ts <a|b|c> [platform]");
    console.error("  a = 1-shot Veo 3.1 Fast 8s");
    console.error("  b = 2-shot Veo 3.1 Fast chain 8s (4s + 4s)");
    console.error("  c = 1-shot Veo 3 (full) 8s");
    process.exit(1);
  }
  const platformId = (process.argv[3] as PlatformId | undefined) ?? "tiktok-feed";
  const platformSpec = getPlatformSpec(platformId);
  if (!platformSpec) {
    console.error(`Unknown platform: ${platformId}`);
    process.exit(1);
  }

  const cfg = testConfig(test);
  const timestamp = Date.now();
  const slug = LINKEDITCH.name.toLowerCase().replace(/\s+/g, "-");
  const workDir = path.join(COMPARISON_DIR, `${test}-${timestamp}`);
  const publicDir = path.join(workDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  console.log(`[veo:${test}] ${cfg.label} -> platform=${platformId}`);
  console.log(`[veo:${test}] workDir=${workDir}`);

  const builder = new ProfileBuilder();
  builder.setConcept(LINKEDITCH);
  builder.setTargetPlatforms([platformId]);

  // ---- 1. Brief (cached across tests) ------------------------------------
  const brief = await loadOrCreateBrief(cfg.numShots);
  await fs.writeFile(path.join(workDir, "brief.json"), JSON.stringify(brief, null, 2));

  builder.setCreative({
    hook_template: LINKEDITCH.hookTemplate ?? "fake-satisfying",
    hook_template_skeleton: brief.shots[0]?.veoPrompt.slice(0, 200) ?? brief.tagline.slice(0, 200),
    humor_flavor: LINKEDITCH.humor ?? "self-aware",
    cta_framing: "gain",
    cta_text: brief.endCardText,
    cta_scarcity_tier: null,
  });
  builder.setLint({ pass: true, hardFailures: [], softWarnings: [], retryCount: 0 });

  // ---- 2. Cartesia VO per shot -------------------------------------------
  const audioDir = path.join(publicDir, "audio");
  const adScript = briefToAdScript(brief);
  const ttsT0 = Date.now();
  console.log(`[veo:${test}] cartesia VO (${brief.shots.length} shots)...`);
  const audio = await builder.timeCall("cartesia", 0.011 * brief.shots.length, () =>
    cartesiaTts(adScript, audioDir),
  );
  console.log(`[veo:${test}] tts done in ${((Date.now() - ttsT0) / 1000).toFixed(1)}s`);

  builder.setAudio({
    voice_provider: "cartesia",
    voice_model: "sonic-3",
    voice_id: "694f9389-aac1-45b6-b726-9d9369183238",
    voice_speed: null,
    voice_emotion: null,
    music_provider: "none",
    music_prompt: null,
    music_duration_sec: null,
    bait_clip_source: "none",
    bait_clip_id_or_prompt: null,
    interrupt_sfx_id: null,
  });

  // ---- 3. Veo clips ------------------------------------------------------
  console.log(`[veo:${test}] generating veo clips (${cfg.model})...`);
  await generateClips(test, brief, publicDir, builder);

  // ---- 4. Build VeoAd inputProps -----------------------------------------
  const shots = brief.shots.map((s, i) => {
    const sceneAudio = audio[i];
    const audioPath = sceneAudio?.audioPath
      ? path.relative(publicDir, sceneAudio.audioPath).replace(/\\/g, "/")
      : null;
    return {
      clipPath: `shot-${i}.mp4`,
      audioPath: s.voiceover.trim().length > 0 ? audioPath : null,
      durationSec: s.durationSec,
      onScreenText: s.onScreenText ?? null,
    };
  });
  const totalDurationSec = shots.reduce((a, s) => a + s.durationSec, 0);
  const fps = platformSpec.fps || 30;
  const totalFrames = Math.max(1, Math.round(totalDurationSec * fps));

  builder.setVisual({
    palette: { primary: "#F59E0B", accent: "#F59E0B", bg: "#000000", fg: "#FFFFFF" },
    palette_source: "default-by-voicestyle",
    hero_clip_source: "veo",
    hero_clip_prompt: brief.shots.map((s) => s.veoPrompt).join(" || "),
    captions_burned_in: false,
    brand_mark_persistent: true,
    cuts_per_second: shots.length / Math.max(1, totalDurationSec),
    total_cuts: shots.length,
    sub_cuts_per_scene: Object.fromEntries(shots.map((_, i) => [String(i), 1])),
  });

  const profileScenes: ProfileScene[] = brief.shots.map((s, i) => ({
    index: i,
    kind: "veo-shot",
    duration_sec: Number(s.durationSec.toFixed(3)),
    headline: s.onScreenText ?? null,
    subline: null,
    voiceover: s.voiceover || null,
    visual_treatment: "veo-fullbleed",
    broll_query: null,
    ai_clip_prompt: s.veoPrompt,
    sfx_query: null,
    bait_clip_prompt: null,
  }));
  builder.setScenes(profileScenes);

  // ---- 5. Bundle + render ------------------------------------------------
  console.log(`[veo:${test}] bundling Remotion (publicDir=${publicDir})...`);
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "src/index.tsx"),
    publicDir,
  });

  const inputProps = {
    shots,
    endCardText: brief.endCardText,
    appName: LINKEDITCH.name,
    platformSpec,
    fps,
  };

  const composition = await selectComposition({
    serveUrl,
    id: "VeoAd",
    inputProps: inputProps as unknown as Record<string, unknown>,
  });

  const outFile = path.join(ROOT, "out", `${slug}-veo-${test}-${timestamp}.mp4`);
  console.log(`[veo:${test}] rendering -> ${outFile}`);
  const renderT0 = Date.now();
  await renderMedia({
    composition: {
      ...composition,
      width: platformSpec.width,
      height: platformSpec.height,
      fps,
      durationInFrames: totalFrames,
    },
    serveUrl,
    codec: "h264",
    outputLocation: outFile,
    inputProps: inputProps as unknown as Record<string, unknown>,
  });
  const stat = await fs.stat(outFile);
  const fileMb = stat.size / 1024 / 1024;
  const sha = await sha256OfFile(outFile);
  console.log(`[veo:${test}] done in ${((Date.now() - renderT0) / 1000).toFixed(1)}s (${fileMb.toFixed(2)} MB)`);

  builder.setOutputs([
    {
      platform: platformId,
      path: outFile,
      width: platformSpec.width,
      height: platformSpec.height,
      duration_sec: Number((totalFrames / fps).toFixed(3)),
      file_size_mb: Number(fileMb.toFixed(3)),
      sha256: sha,
    },
  ]);

  // ---- 6. Profile.json ---------------------------------------------------
  const profile = await builder.finalize();
  const profilePath = path.join(ROOT, "out", `${slug}-veo-${test}-${timestamp}.profile.json`);
  await writeProfile(profile, profilePath);
  console.log(`[veo:${test}] profile -> ${profilePath}`);

  // ---- 7. Summary --------------------------------------------------------
  console.log("\n=== veo render summary ===");
  console.log("test | shots | duration | size      | cost");
  console.log("-----|-------|----------|-----------|--------");
  const totalCost = profile.generation_cost_usd;
  console.log(
    `  ${test}  |   ${shots.length}   | ${totalDurationSec.toFixed(1)}s     | ${fileMb.toFixed(2)} MB   | $${totalCost.toFixed(2)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
