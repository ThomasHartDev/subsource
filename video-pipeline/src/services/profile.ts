import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdProfile,
  AppConcept,
  PlatformId,
  ProfileExternalCall,
  ProfileOutputFile,
  ProfileScene,
} from "../types";

// Cached pipeline_version. package.json doesn't change between calls inside
// one render, so reading once and remembering it is fine.
let cachedPipelineVersion: string | null = null;

async function readPipelineVersion(): Promise<string> {
  if (cachedPipelineVersion !== null) return cachedPipelineVersion;
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/services/profile.ts -> ../../package.json
  const pkgPath = path.resolve(here, "..", "..", "package.json");
  const raw = await fs.readFile(pkgPath, "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  const v = typeof parsed.version === "string" ? parsed.version : "0.0.0";
  cachedPipelineVersion = v;
  return v;
}

export async function sha256OfFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

type CreativeInput = {
  hook_template: string;
  hook_template_skeleton: string;
  humor_flavor: string;
  cta_framing: "loss" | "gain";
  cta_text: string;
  cta_scarcity_tier: string | null;
};

type AudioInput = {
  voice_provider: "edge" | "cartesia" | "elevenlabs";
  voice_model: string | null;
  voice_id: string | null;
  voice_speed: number | null;
  voice_emotion: string | null;
  music_provider: "suno" | "stable-audio" | "none";
  music_prompt: string | null;
  music_duration_sec: number | null;
  bait_clip_source: "pexels" | "veo" | "none";
  bait_clip_id_or_prompt: string | null;
  interrupt_sfx_id: string | null;
};

type VisualInput = {
  palette: { primary: string; accent: string; bg: string; fg: string };
  palette_source: "user" | "claude-derived" | "default-by-voicestyle";
  hero_clip_source: "veo" | "none";
  hero_clip_prompt: string | null;
  captions_burned_in: boolean;
  brand_mark_persistent: boolean;
  cuts_per_second: number;
  total_cuts: number;
  sub_cuts_per_scene: Record<string, number>;
};

type LintInput = {
  pass: boolean;
  hardFailures: string[];
  softWarnings: string[];
  retryCount: number;
};

// Required keys before finalize() will succeed. Listed here so the missing-key
// error can name them precisely.
const REQUIRED_KEYS: Array<keyof AdProfile> = [
  "schema_version",
  "profile_id",
  "created_at",
  "pipeline_version",
  "app_name",
  "app_one_liner",
  "app_audience",
  "app_pain",
  "app_outcome",
  "hook_template",
  "hook_template_skeleton",
  "humor_flavor",
  "cta_framing",
  "cta_text",
  "voice_provider",
  "music_provider",
  "bait_clip_source",
  "palette",
  "palette_source",
  "hero_clip_source",
  "captions_burned_in",
  "brand_mark_persistent",
  "cuts_per_second",
  "total_cuts",
  "sub_cuts_per_scene",
  "scenes",
  "target_platforms",
  "output_files",
  "lint_pass",
  "lint_hard_failures",
  "lint_soft_warnings",
  "lint_retry_count",
];

export class ProfileBuilder {
  private profile: Partial<AdProfile>;
  private startTime: number;
  private pipelineVersionPromise: Promise<string>;

  constructor() {
    this.startTime = Date.now();
    this.profile = {
      schema_version: "1.0.0",
      profile_id: randomUUID(),
      created_at: new Date().toISOString(),
      external_calls: [],
      generation_cost_usd: 0,
      linked_campaign_ids: [],
      performance_snapshots: [],
    };
    // Fire-and-cache pipeline_version. We await this in finalize() so the field
    // is guaranteed present.
    this.pipelineVersionPromise = readPipelineVersion();
  }

  setConcept(c: AppConcept): void {
    this.profile.app_name = c.name;
    this.profile.app_one_liner = c.oneLiner;
    this.profile.app_audience = c.audience;
    this.profile.app_pain = c.pain;
    this.profile.app_outcome = c.outcome;
    // Default humor_flavor from concept if creative didn't override yet.
    if (!this.profile.humor_flavor) {
      this.profile.humor_flavor = c.humor ?? "self-aware";
    }
  }

  setCreative(c: CreativeInput): void {
    this.profile.hook_template = c.hook_template;
    this.profile.hook_template_skeleton = c.hook_template_skeleton.slice(0, 200);
    this.profile.humor_flavor = c.humor_flavor;
    this.profile.cta_framing = c.cta_framing;
    this.profile.cta_text = c.cta_text;
    this.profile.cta_scarcity_tier = c.cta_scarcity_tier;
  }

  setAudio(a: AudioInput): void {
    this.profile.voice_provider = a.voice_provider;
    this.profile.voice_model = a.voice_model;
    this.profile.voice_id = a.voice_id;
    this.profile.voice_speed = a.voice_speed;
    this.profile.voice_emotion = a.voice_emotion;
    this.profile.music_provider = a.music_provider;
    this.profile.music_prompt = a.music_prompt;
    this.profile.music_duration_sec = a.music_duration_sec;
    this.profile.bait_clip_source = a.bait_clip_source;
    this.profile.bait_clip_id_or_prompt = a.bait_clip_id_or_prompt;
    this.profile.interrupt_sfx_id = a.interrupt_sfx_id;
  }

  setVisual(v: VisualInput): void {
    this.profile.palette = v.palette;
    this.profile.palette_source = v.palette_source;
    this.profile.hero_clip_source = v.hero_clip_source;
    this.profile.hero_clip_prompt = v.hero_clip_prompt;
    this.profile.captions_burned_in = v.captions_burned_in;
    this.profile.brand_mark_persistent = v.brand_mark_persistent;
    this.profile.cuts_per_second = v.cuts_per_second;
    this.profile.total_cuts = v.total_cuts;
    this.profile.sub_cuts_per_scene = v.sub_cuts_per_scene;
  }

  setScenes(scenes: ProfileScene[]): void {
    this.profile.scenes = scenes;
  }

  setLint(lint: LintInput): void {
    this.profile.lint_pass = lint.pass;
    this.profile.lint_hard_failures = lint.hardFailures;
    this.profile.lint_soft_warnings = lint.softWarnings;
    this.profile.lint_retry_count = lint.retryCount;
  }

  setOutputs(files: ProfileOutputFile[]): void {
    this.profile.output_files = files;
    // target_platforms mirrors output platforms for now. Render.ts can override
    // by calling setTargetPlatforms if it cares about the requested vs actually
    // shipped distinction, but mirroring is the right default.
    if (!this.profile.target_platforms) {
      this.profile.target_platforms = files.map((f) => f.platform);
    }
  }

  setTargetPlatforms(platforms: PlatformId[]): void {
    this.profile.target_platforms = platforms;
  }

  recordExternalCall(call: ProfileExternalCall): void {
    if (!this.profile.external_calls) this.profile.external_calls = [];
    this.profile.external_calls.push(call);
    if (call.ok && call.cost_usd > 0) {
      this.addCost(call.cost_usd);
    }
  }

  addCost(usd: number): void {
    this.profile.generation_cost_usd = (this.profile.generation_cost_usd ?? 0) + usd;
  }

  // Wraps an async call, records duration + ok/error + cost as a single
  // ProfileExternalCall. Cost is the budgeted cost for a successful call;
  // failures still log the attempt but with cost=0 so totals stay honest.
  async timeCall<T>(
    service: ProfileExternalCall["service"],
    cost: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      this.recordExternalCall({
        service,
        duration_ms: Date.now() - t0,
        cost_usd: cost,
        ok: true,
        error: null,
      });
      return result;
    } catch (e) {
      this.recordExternalCall({
        service,
        duration_ms: Date.now() - t0,
        cost_usd: 0,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async finalize(): Promise<AdProfile> {
    this.profile.pipeline_version = await this.pipelineVersionPromise;
    this.profile.generation_time_sec = Math.round((Date.now() - this.startTime) / 1000);

    const missing: string[] = [];
    for (const key of REQUIRED_KEYS) {
      if (this.profile[key] === undefined) missing.push(String(key));
    }
    if (missing.length > 0) {
      throw new Error(`ProfileBuilder.finalize: missing required fields: ${missing.join(", ")}`);
    }
    // Cast is safe — we just checked every required key.
    return this.profile as AdProfile;
  }
}

export async function writeProfile(profile: AdProfile, outPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(profile, null, 2), "utf8");
}

// Reads + formats a profile for stdout. Used by inspect-profile.ts. Kept here
// so the formatting logic stays next to the schema.
export async function summarizeProfile(profilePath: string): Promise<string> {
  const raw = await fs.readFile(profilePath, "utf8");
  const p = JSON.parse(raw) as AdProfile;
  const lines: string[] = [];
  lines.push(`=== Ad Profile (schema ${p.schema_version}) ===`);
  lines.push(`ID:                  ${p.profile_id}`);
  lines.push(`Created:             ${p.created_at}`);
  lines.push(`Pipeline:            v${p.pipeline_version}`);
  lines.push("");
  lines.push(`App:                 ${p.app_name}`);
  lines.push(`Audience:            ${p.app_audience}`);
  lines.push("");
  lines.push(`Hook template:       ${p.hook_template}`);
  lines.push(`Humor:               ${p.humor_flavor}`);
  lines.push(`CTA framing:         ${p.cta_framing}`);
  lines.push(`CTA text:            ${JSON.stringify(p.cta_text)}`);
  if (p.cta_scarcity_tier) lines.push(`CTA scarcity tier:   ${p.cta_scarcity_tier}`);
  lines.push("");
  const voiceModel = p.voice_model ? ` (${p.voice_model})` : "";
  const voiceIdShort = p.voice_id ? ` -- voice ${p.voice_id.slice(0, 8)}...` : "";
  lines.push(`Voice:               ${p.voice_provider}${voiceModel}${voiceIdShort}`);
  lines.push(`Music:               ${p.music_provider}`);
  lines.push(`Bait clip:           ${p.bait_clip_source}${p.bait_clip_id_or_prompt ? ` -- ${p.bait_clip_id_or_prompt}` : ""}`);
  lines.push(`Interrupt SFX:       ${p.interrupt_sfx_id ?? "(none)"}`);
  lines.push("");
  lines.push(
    `Palette:             ${p.palette.primary} / ${p.palette.bg} / ${p.palette.fg} / ${p.palette.accent}`,
  );
  const subCutsStr = JSON.stringify(p.sub_cuts_per_scene).replace(/"/g, "");
  lines.push(`Cuts:                ${p.total_cuts} total, ${p.cuts_per_second.toFixed(2)}/sec, sub-cuts: ${subCutsStr}`);
  lines.push("");
  lines.push(`Scenes (${p.scenes.length}):`);
  for (const s of p.scenes) {
    const idx = String(s.index).padStart(2, " ");
    const kind = s.kind.padEnd(14, " ");
    const dur = `${s.duration_sec.toFixed(1)}s`.padStart(5, " ");
    const headline = s.headline ? JSON.stringify(s.headline) : "(no VO)";
    lines.push(`  ${idx} ${kind} ${dur}  ${headline}`);
  }
  lines.push("");
  lines.push(`Outputs (${p.output_files.length}):`);
  for (const o of p.output_files) {
    const platform = o.platform.padEnd(15, " ");
    const dims = `${o.width}x${o.height}`.padEnd(10, " ");
    const dur = `${o.duration_sec.toFixed(1)}s`.padStart(5, " ");
    const size = `${o.file_size_mb.toFixed(1)}MB`.padStart(7, " ");
    lines.push(`  ${platform} ${dims} ${dur} ${size}  sha:${o.sha256.slice(0, 8)}...`);
  }
  lines.push("");
  lines.push(`External calls (${p.external_calls.length}):`);
  for (const c of p.external_calls) {
    const service = c.service.padEnd(24, " ");
    const dur = `${(c.duration_ms / 1000).toFixed(1)}s`.padStart(6, " ");
    const cost = `$${c.cost_usd.toFixed(3)}`.padStart(7, " ");
    const status = c.ok ? "ok" : `FAILED -- ${c.error ?? "unknown"}`;
    lines.push(`  ${service} ${dur} ${cost}  ${status}`);
  }
  lines.push("");
  lines.push(
    `Lint:                ${p.lint_pass ? "pass" : "fail"} (${p.lint_retry_count} retries, ${p.lint_hard_failures.length} hard failures, ${p.lint_soft_warnings.length} soft warnings)`,
  );
  lines.push(`Total cost:          $${p.generation_cost_usd.toFixed(3)}`);
  lines.push(`Total time:          ${p.generation_time_sec}s`);
  return lines.join("\n");
}
