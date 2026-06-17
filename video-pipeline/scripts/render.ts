import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { generateScript } from "../src/services/script";
import { synthesizeScenes as edgeTts } from "../src/services/tts-edge";
// elevenlabs kept as a code reference only — premium tier now uses Cartesia.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { synthesizeScenes as _elevenTts } from "../src/services/tts-elevenlabs";
import { synthesizeScenes as cartesiaTts } from "../src/services/tts-cartesia";
import { generateHeroClip } from "../src/services/ai-clip-fal";
import { generateMusic as sunoMusic } from "../src/services/music-suno";
import { generateMusic as stableMusic } from "../src/services/music-stable";
import { getAudioDuration } from "../src/services/audio-meta";
import { ProfileBuilder, writeProfile, sha256OfFile } from "../src/services/profile";
import platformSpecs from "../src/platform-specs.json";
import { APP_PITCH_COMPOSITION_IDS, aspectFamily } from "../src/template/safe-zones";
import { DEFAULT_PLATFORMS, ITERATION_PLATFORMS, getPlatformSpec, type AdScript, type AppConcept, type PlatformId, type ProfileOutputFile, type ProfileScene } from "../src/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const LINKEDITCH: AppConcept = {
  name: "Linkeditch",
  oneLiner: "AI applies to every remote SWE job with a custom cover letter. While you sleep.",
  audience: "Software engineers job-hunting in 2026, especially remote-only roles",
  pain: "Spending 3 hours a day rewriting cover letters for 47 LinkedIn easy-applies. Hearing back from 2.",
  outcome: "Linkeditch reads each job, writes a unique cover letter, fills the whole application, and stops one click before submit so you can review. Apply to 50 jobs in the time it takes to send 5 manually.",
  humor: "self-aware",
  hookTemplate: "fake-satisfying",
};

// The conductor (command-center, App Validation Pipeline item #635) hands the
// concept in over VIDEO_CONCEPT_JSON. Falls back to LINKEDITCH so existing
// `pnpm render` calls keep working unchanged.
function loadConcept(): AppConcept {
  const raw = process.env.VIDEO_CONCEPT_JSON;
  if (!raw) return LINKEDITCH;
  try {
    const parsed = JSON.parse(raw) as Partial<AppConcept>;
    if (parsed && typeof parsed.name === "string" && typeof parsed.oneLiner === "string") {
      return parsed as AppConcept;
    }
  } catch {
    /* fall through to default */
  }
  console.warn("[render] VIDEO_CONCEPT_JSON invalid; using default LINKEDITCH concept");
  return LINKEDITCH;
}

type Tier = "cheap" | "premium";

type RenderRow = {
  platform: PlatformId;
  dimensions: string;
  width: number;
  height: number;
  durationSec: number;
  fileMb: number;
  outFile: string;
  status: "ok" | "fail";
  error?: string;
  hero: boolean;
  music: boolean;
};

function parsePlatforms(arg: string | undefined): PlatformId[] {
  const validIds = Object.keys(platformSpecs) as PlatformId[];
  if (!arg || arg === "default") return DEFAULT_PLATFORMS;
  if (arg === "iterate") return ITERATION_PLATFORMS;
  if (arg === "all") return validIds;
  const requested = arg.split(",").map((s) => s.trim()).filter(Boolean) as PlatformId[];
  const invalid = requested.filter((id) => !validIds.includes(id));
  if (invalid.length > 0) {
    console.error(`Invalid platform id(s): ${invalid.join(", ")}`);
    console.error(`Valid ids: ${validIds.join(", ")}`);
    process.exit(1);
  }
  return requested;
}

// Short visual phrase derived from the first scene + voice style. Used to steer
// the Veo hero clip toward something coherent with the ad's mood.
function heroVisualHint(script: AdScript): string {
  const firstHeadline = script.scenes[0]?.headline?.toLowerCase() ?? "";
  const isReceipts = /receipt|tax|paper|invoice/.test(firstHeadline);
  switch (script.voiceStyle) {
    case "calm-pro":
      return isReceipts
        ? "warm desk light, hands sorting paper receipts on dark wood, shallow depth of field"
        : "warm desk light, calm professional environment, shallow depth of field";
    case "confident-warm":
      return isReceipts
        ? "natural window light, organized desk with paper receipts, warm tones"
        : "natural window light, confident professional working, warm tones";
    case "energetic-young":
      return isReceipts
        ? "bright modern workspace, fast hands flipping through receipts, vibrant colors"
        : "bright modern workspace, energetic motion, vibrant colors";
  }
}

function musicPromptFromVoiceStyle(s: AdScript["voiceStyle"]): string {
  switch (s) {
    case "calm-pro":
      return "minimal lo-fi piano, calm focus music, no vocals, soft warm pads";
    case "confident-warm":
      return "warm acoustic indie folk, fingerpicked guitar, hopeful, no vocals";
    case "energetic-young":
      return "upbeat synth pop, driving drums, bright, optimistic, no vocals";
  }
}

// Mirror of PALETTES inside AppPitchAd.tsx so the profile can record what the
// renderer actually used. Keep these in sync if the template palette changes.
const PALETTES: Record<AdScript["voiceStyle"], { primary: string; accent: string; bg: string; fg: string }> = {
  "confident-warm": { primary: "#F59E0B", accent: "#F59E0B", bg: "#0F172A", fg: "#FFFFFF" },
  "energetic-young": { primary: "#22D3EE", accent: "#22D3EE", bg: "#0B0E14", fg: "#FFFFFF" },
  "calm-pro": { primary: "#34D399", accent: "#34D399", bg: "#111827", fg: "#FFFFFF" },
};

// Cheap heuristic — scarcity / loss-aversion phrasing flips this to "loss".
// Anything else (positive framing, generic CTA) stays "gain".
function deriveCtaFraming(ctaText: string): "loss" | "gain" {
  const t = ctaText.toLowerCase();
  const lossSignals = ["lock in", "first", "spots left", "spots remaining", "don't lose", "dont lose", "lifetime", "forever", "before it's gone", "before its gone", "last chance"];
  return lossSignals.some((s) => t.includes(s)) ? "loss" : "gain";
}

// Pulls the scarcity tier phrase out of a CTA if present (e.g. "first 100", "first 250"). Null otherwise.
function deriveCtaScarcityTier(ctaText: string): string | null {
  const m = ctaText.match(/first\s+(\d+)/i);
  if (m && m[0]) return m[0].toLowerCase();
  return null;
}

async function main() {
  const tier = (process.argv[2] as Tier) || "cheap";
  if (tier !== "cheap" && tier !== "premium") {
    console.error("Usage: render.ts <cheap|premium> [platforms]");
    console.error("  platforms: comma-separated ids, or 'all', or 'iterate', or 'default' (omit = default)");
    process.exit(1);
  }
  const platforms = parsePlatforms(process.argv[3]);
  const concept = loadConcept();
  console.log(
    `[render] tier=${tier} platforms=${platforms.join(",")} (${platforms.length}) concept=${concept.name}`,
  );

  // VIDEO_RUN_TAG lets the conductor find this run's exact output files.
  const timestamp = process.env.VIDEO_RUN_TAG ?? Date.now();
  const slug = concept.name.toLowerCase().replace(/\s+/g, "-");
  const runTag = `${slug}-${tier}-${timestamp}`;
  const workDir = path.join(ROOT, "out", runTag);
  await fs.mkdir(workDir, { recursive: true });
  const publicDir = path.join(workDir, "public");
  await fs.mkdir(publicDir, { recursive: true });

  // ---- 0. Profile builder accumulates decisions across every stage -------
  const builder = new ProfileBuilder();
  builder.setConcept(concept);
  builder.setTargetPlatforms(platforms);

  // ---- 1. Generate script ONCE -------------------------------------------
  console.log(`[${tier}] generating script via claude cli...`);
  const { script, lint } = await generateScript(concept, { tier, platforms });
  await fs.writeFile(path.join(workDir, "script.json"), JSON.stringify(script, null, 2));

  // Capture creative direction the moment we have a script + lint result.
  const ctaScene = script.scenes.find((s) => s.kind === "cta");
  const ctaText = ctaScene?.voiceover ?? ctaScene?.headline ?? "";
  const hookTemplate = concept.hookTemplate ?? "fake-satisfying";
  const hookSkeleton = script.scenes[0]?.voiceover ?? script.scenes[0]?.headline ?? "";
  builder.setCreative({
    hook_template: hookTemplate,
    hook_template_skeleton: hookSkeleton.slice(0, 200),
    humor_flavor: concept.humor ?? "self-aware",
    cta_framing: deriveCtaFraming(ctaText),
    cta_text: ctaText,
    cta_scarcity_tier: deriveCtaScarcityTier(ctaText),
  });
  builder.setLint({
    pass: lint.pass,
    hardFailures: lint.hardFailures,
    softWarnings: lint.softWarnings,
    retryCount: lint.retryCount,
  });

  // ---- 2. Synthesize voiceover ONCE --------------------------------------
  console.log(`[${tier}] synthesizing voiceover (${script.scenes.length} scenes)...`);
  const audioDir = path.join(publicDir, "audio");
  const ttsT0 = Date.now();
  // Cartesia bills per character. ~0.011/scene is a fair fixed estimate for the
  // short copy we generate; edge-tts is free.
  const audio = tier === "cheap"
    ? await builder.timeCall("edge-tts", 0, () => edgeTts(script, audioDir))
    : await builder.timeCall("cartesia", 0.011 * script.scenes.length, () => cartesiaTts(script, audioDir));
  const ttsElapsed = ((Date.now() - ttsT0) / 1000).toFixed(1);
  console.log(`[${tier}] tts done in ${ttsElapsed}s (${tier === "cheap" ? "edge" : "cartesia"})`);

  if (tier === "cheap") {
    builder.setAudio({
      voice_provider: "edge",
      voice_model: null,
      voice_id: null,
      voice_speed: null,
      voice_emotion: null,
      music_provider: "none",
      music_prompt: null,
      music_duration_sec: null,
      bait_clip_source: "none",
      bait_clip_id_or_prompt: null,
      interrupt_sfx_id: null,
    });
  }

  // ---- 2b. Premium-only: hero clip + music in parallel -------------------
  // Hero runs independently; music chain tries Suno first then falls back to
  // Stable Audio so a GoAPI outage doesn't lose the whole render.
  let heroClipSrc: string | undefined;
  let musicSrc: string | undefined;
  let musicProvider: "suno" | "stable-audio" | "none" = "none";
  let musicDurationSec: number | null = null;
  let heroPromptUsed: string | null = null;
  let musicPromptUsed: string | null = null;
  if (tier === "premium") {
    const heroPrompt = `${script.appName} ad: ${script.tagline}. Cinematic, 1080p, ${heroVisualHint(script)}. No text, no logos.`;
    const musicPrompt = musicPromptFromVoiceStyle(script.voiceStyle);
    heroPromptUsed = heroPrompt;
    musicPromptUsed = musicPrompt;

    async function runMusicChain(): Promise<{ musicPath: string; durationSec: number } | null> {
      const sunoStart = Date.now();
      try {
        const r = await sunoMusic(musicPrompt, publicDir);
        musicProvider = "suno";
        builder.recordExternalCall({ service: "goapi-suno", duration_ms: Date.now() - sunoStart, cost_usd: 0.02, ok: true, error: null });
        console.log(`[premium] suno music ok in ${((Date.now() - sunoStart) / 1000).toFixed(1)}s`);
        return r;
      } catch (e) {
        const sunoErr = e instanceof Error ? e.message : String(e);
        builder.recordExternalCall({ service: "goapi-suno", duration_ms: Date.now() - sunoStart, cost_usd: 0, ok: false, error: sunoErr });
        console.warn(`[premium] suno failed: ${sunoErr}`);
        console.log(`[premium] falling back to Stable Audio...`);
        const fbStart = Date.now();
        try {
          const r = await stableMusic(musicPrompt, publicDir);
          musicProvider = "stable-audio";
          builder.recordExternalCall({ service: "replicate-stable-audio", duration_ms: Date.now() - fbStart, cost_usd: 0.20, ok: true, error: null });
          console.log(`[premium] stable audio ok in ${((Date.now() - fbStart) / 1000).toFixed(1)}s`);
          return r;
        } catch (e2) {
          const fbErr = e2 instanceof Error ? e2.message : String(e2);
          builder.recordExternalCall({ service: "replicate-stable-audio", duration_ms: Date.now() - fbStart, cost_usd: 0, ok: false, error: fbErr });
          console.warn(`[premium] stable audio also failed: ${fbErr}`);
          console.warn(`[premium] shipping without music`);
          musicProvider = "none";
          return null;
        }
      }
    }

    console.log("[premium] generating hero clip + music in parallel...");
    const t0 = Date.now();
    const heroT0 = Date.now();
    const [hero, music] = await Promise.allSettled([
      generateHeroClip(heroPrompt, publicDir).then((r) => ({ ...r, elapsedSec: (Date.now() - heroT0) / 1000 })),
      runMusicChain(),
    ]);
    console.log(`[premium] external generation done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    if (hero.status === "fulfilled") {
      heroClipSrc = path.relative(publicDir, hero.value.clipPath).replace(/\\/g, "/");
      builder.recordExternalCall({ service: "fal-veo", duration_ms: Math.round(hero.value.elapsedSec * 1000), cost_usd: 0.50, ok: true, error: null });
      console.log(`[premium] hero clip ok in ${hero.value.elapsedSec.toFixed(1)}s -> ${heroClipSrc}`);
    } else {
      const heroErr = hero.reason instanceof Error ? hero.reason.message : String(hero.reason);
      builder.recordExternalCall({ service: "fal-veo", duration_ms: Date.now() - heroT0, cost_usd: 0, ok: false, error: heroErr });
      console.error(`[premium] hero clip FAILED: ${heroErr}`);
    }
    if (music.status === "fulfilled" && music.value) {
      musicSrc = path.relative(publicDir, music.value.musicPath).replace(/\\/g, "/");
      musicDurationSec = music.value.durationSec;
      console.log(`[premium] music provider=${musicProvider} -> ${musicSrc}`);
    } else if (music.status === "rejected") {
      console.error(`[premium] music chain unexpectedly rejected: ${music.reason instanceof Error ? music.reason.message : String(music.reason)}`);
    }

    builder.setAudio({
      voice_provider: "cartesia",
      voice_model: "sonic-3",
      voice_id: "694f9389-aac1-45b6-b726-9d9369183238",
      voice_speed: null,
      voice_emotion: null,
      music_provider: musicProvider,
      music_prompt: musicPromptUsed,
      music_duration_sec: musicDurationSec,
      bait_clip_source: "none",
      bait_clip_id_or_prompt: null,
      interrupt_sfx_id: null,
    });
  }

  // ---- 3. Measure scene durations ONCE -----------------------------------
  console.log(`[${tier}] measuring scene durations from real audio...`);
  const measured = await Promise.all(
    script.scenes.map(async (s, i) => {
      const a = audio[i]!;
      const audioDur = await getAudioDuration(a.audioPath);
      const padded = audioDur + 0.4;
      const relAudio = path.relative(publicDir, a.audioPath).replace(/\\/g, "/");
      return { scene: s, audioSrc: relAudio, audioSec: padded };
    }),
  );
  const totalSec = measured.reduce((a, m) => a + m.audioSec, 0);

  // Read each scene's word-timestamps JSON if the TTS service produced one,
  // and bundle into a parallel array. The composition consumes this through
  // inputProps, avoiding a runtime fetch.
  const sceneTimestamps = await Promise.all(
    audio.map(async (a) => {
      if (!a.timestampsPath) return null;
      try {
        const raw = await fs.readFile(a.timestampsPath, "utf8");
        const parsed = JSON.parse(raw) as {
          words: string[];
          starts: number[];
          ends: number[];
        };
        if (
          !Array.isArray(parsed.words) ||
          !Array.isArray(parsed.starts) ||
          !Array.isArray(parsed.ends)
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }),
  );

  // ---- 4. Bundle ONCE ----------------------------------------------------
  console.log(`[${tier}] bundling Remotion project (publicDir=${publicDir})...`);
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "src/index.tsx"),
    publicDir,
  });

  // ---- 4b. Capture visual + scene plan into the profile -----------------
  // Cuts: bait_clip + cta scenes are atomic (1 cut each); other scenes split
  // into 2 sub-cuts via the AppPitchAd variant logic. Mirror that count here.
  const subCutsPerScene: Record<string, number> = {};
  for (let i = 0; i < script.scenes.length; i++) {
    const k = script.scenes[i]?.kind;
    subCutsPerScene[String(i)] = k === "bait_clip" || k === "cta" ? 1 : 2;
  }
  const totalCuts = Object.values(subCutsPerScene).reduce((a, b) => a + b, 0);
  const cutsPerSecond = totalSec > 0 ? totalCuts / totalSec : 0;

  builder.setVisual({
    palette: PALETTES[script.voiceStyle],
    palette_source: "default-by-voicestyle",
    hero_clip_source: heroClipSrc ? "veo" : "none",
    hero_clip_prompt: heroPromptUsed,
    captions_burned_in: true,
    brand_mark_persistent: true,
    cuts_per_second: cutsPerSecond,
    total_cuts: totalCuts,
    sub_cuts_per_scene: subCutsPerScene,
  });

  // ProfileScene plan — uses real audio-padded duration measured above.
  const profileScenes: ProfileScene[] = script.scenes.map((s, i) => ({
    index: i,
    kind: s.kind,
    duration_sec: Number((measured[i]?.audioSec ?? s.durationSec).toFixed(3)),
    headline: s.headline ?? null,
    subline: s.subline ?? null,
    voiceover: s.voiceover ?? null,
    visual_treatment: s.kind === "bait_clip" ? "bait-clip-fullbleed" : i === 1 && heroClipSrc ? "hero-clip-bg" : "palette-bg",
    broll_query: s.broll_query ?? null,
    ai_clip_prompt: i === 1 && heroClipSrc ? heroPromptUsed : null,
    sfx_query: s.sfx_query ?? null,
    bait_clip_prompt: s.bait_clip_prompt ?? null,
  }));
  builder.setScenes(profileScenes);

  // ---- 5. Loop platforms -------------------------------------------------
  const rows: RenderRow[] = [];
  for (const platformId of platforms) {
    const spec = getPlatformSpec(platformId);
    const fps = spec.fps || 30;
    const targetSec = Math.min(totalSec, spec.target_duration_sec);
    const cappedSec = Math.max(spec.min_duration_sec, Math.min(targetSec, spec.max_duration_sec));
    const cappedFrames = Math.round(cappedSec * fps);

    // Re-frame scenes against this platform's fps.
    let cursor = 0;
    let framesUsed = 0;
    const timedScenes = measured.map((m) => {
      const sceneFrames = Math.round(m.audioSec * fps);
      const startFrame = cursor;
      cursor += sceneFrames;
      framesUsed = cursor;
      return {
        ...m.scene,
        audioSrc: m.audioSrc,
        durationFrames: sceneFrames,
        startFrame,
      };
    });
    const finalFrames = Math.min(framesUsed, cappedFrames);

    const inputProps = {
      script,
      scenes: timedScenes,
      fps,
      platformSpec: spec,
      musicSrc,
      heroClipSrc,
      sceneTimestamps,
    };

    // Pick the registration that matches this platform's aspect family —
    // square/landscape comps carry their own safe-zone math, so a 16:9 render
    // is a real 16:9 layout, not a dimension override on the 9:16 comp.
    const composition = await selectComposition({
      serveUrl,
      id: APP_PITCH_COMPOSITION_IDS[aspectFamily(spec)],
      inputProps: inputProps as unknown as Record<string, unknown>,
    });

    const outFile = path.join(ROOT, "out", `${slug}-${tier}-${platformId}-${timestamp}.mp4`);
    console.log(`[${tier}/${platformId}] ${spec.width}x${spec.height} @${fps}fps, ${finalFrames} frames -> ${outFile}`);
    const t0 = Date.now();
    try {
      await renderMedia({
        composition: {
          ...composition,
          width: spec.width,
          height: spec.height,
          fps,
          durationInFrames: finalFrames,
        },
        serveUrl,
        codec: "h264",
        outputLocation: outFile,
        inputProps: inputProps as unknown as Record<string, unknown>,
      });
      const stat = await fs.stat(outFile);
      const fileMb = stat.size / 1024 / 1024;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[${tier}/${platformId}] done in ${elapsed}s (${fileMb.toFixed(2)} MB)`);
      rows.push({
        platform: platformId,
        dimensions: `${spec.width}x${spec.height}`,
        width: spec.width,
        height: spec.height,
        durationSec: finalFrames / fps,
        fileMb,
        outFile,
        status: "ok",
        hero: Boolean(heroClipSrc),
        music: Boolean(musicSrc),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${tier}/${platformId}] FAILED: ${message}`);
      rows.push({
        platform: platformId,
        dimensions: `${spec.width}x${spec.height}`,
        width: spec.width,
        height: spec.height,
        durationSec: finalFrames / fps,
        fileMb: 0,
        outFile,
        status: "fail",
        error: message,
        hero: Boolean(heroClipSrc),
        music: Boolean(musicSrc),
      });
    }
  }

  // ---- 6. Summary --------------------------------------------------------
  console.log("\n=== render summary ===");
  console.log("platform                    | dimensions  | duration | size      | hero | music | status");
  console.log("----------------------------|-------------|----------|-----------|------|-------|-------");
  for (const r of rows) {
    const platform = r.platform.padEnd(28);
    const dims = r.dimensions.padEnd(11);
    const dur = `${r.durationSec.toFixed(1)}s`.padStart(8);
    const size = r.status === "ok" ? `${r.fileMb.toFixed(2)} MB`.padStart(9) : "  -      ";
    const hero = (r.hero ? "yes" : "no").padEnd(4);
    const music = (r.music ? "yes" : "no").padEnd(5);
    console.log(`${platform}| ${dims} | ${dur} | ${size} | ${hero} | ${music} | ${r.status}`);
  }
  // ---- 7. Build + write profile.json -------------------------------------
  const okRows = rows.filter((r) => r.status === "ok");
  const outputFiles: ProfileOutputFile[] = await Promise.all(
    okRows.map(async (r) => {
      const stat = await fs.stat(r.outFile);
      const sha = await sha256OfFile(r.outFile);
      return {
        platform: r.platform,
        path: r.outFile,
        width: r.width,
        height: r.height,
        duration_sec: Number(r.durationSec.toFixed(3)),
        file_size_mb: Number((stat.size / 1024 / 1024).toFixed(3)),
        sha256: sha,
      };
    }),
  );
  builder.setOutputs(outputFiles);

  try {
    const profile = await builder.finalize();
    const profilePath = path.join(ROOT, "out", `${slug}-${tier}-${timestamp}.profile.json`);
    await writeProfile(profile, profilePath);
    console.log(`[render] profile written to ${profilePath}`);
  } catch (e) {
    console.error(`[render] failed to finalize profile: ${e instanceof Error ? e.message : e}`);
  }

  const failed = rows.filter((r) => r.status === "fail").length;
  if (failed > 0) {
    console.error(`\n${failed}/${rows.length} platforms failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
