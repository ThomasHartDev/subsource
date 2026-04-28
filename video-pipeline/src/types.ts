import { z } from "zod";
import platformSpecs from "./platform-specs.json";

export const SceneSchema = z.object({
  kind: z.enum([
    "hook",
    "problem",
    "pain",
    "solution",
    "feature",
    "cta",
    "bait_clip",
    "bait",
    "interrupt",
    "wink",
    "social-proof",
  ]),
  headline: z.string(),
  subline: z.string().optional(),
  voiceover: z.string(),
  durationSec: z.number().min(0.1).max(8),
  bait_clip_prompt: z.string().optional(),
  // Resolved at render time when the fake-satisfying template is chosen — the
  // path (relative to publicDir) of the bait video that becomes the entire
  // first-scene visual. Optional caption painted across the bottom third.
  bait_clip_path: z.string().optional(),
  bait_caption: z.string().optional(),
  sfx_query: z.string().optional(),
  broll_query: z.string().optional(),
  social_proof_count: z.number().optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const AdScriptSchema = z.object({
  appName: z.string(),
  tagline: z.string(),
  voiceStyle: z.enum(["confident-warm", "energetic-young", "calm-pro"]),
  scenes: z.array(SceneSchema).min(4).max(14),
});
export type AdScript = z.infer<typeof AdScriptSchema>;

export type AppConcept = {
  name: string;
  oneLiner: string;
  audience: string;
  pain: string;
  outcome: string;
  humor?: "self-aware" | "deadpan" | "absurd" | "dry" | "none";
  hookTemplate?:
    | "fake-satisfying"
    | "cold-open"
    | "self-intro-ugc"
    | "surreal-stack"
    | "compressed-demo"
    | "voyeur-frame"
    | "stitch-contradict"
    | "authority-pov"
    | "confession-scarcity";
  targetDurationSec?: number; // override platform default; defaults to platform.target_duration_sec
};

export type PlatformId = keyof typeof platformSpecs;

export interface PlatformSpec {
  label: string;
  platform_family: string;
  slot: string;
  width: number;
  height: number;
  fps: number;
  aspect: string;
  min_duration_sec: number;
  max_duration_sec: number;
  target_duration_sec: number;
  max_file_mb: number;
  preferred_codec: string;
  preferred_audio_bitrate_kbps: number;
  safe_top_px: number;
  safe_bottom_px: number;
  safe_left_px: number;
  safe_right_px: number;
  notes: string;
}

export function getPlatformSpec(id: PlatformId): PlatformSpec {
  return (platformSpecs as Record<PlatformId, PlatformSpec>)[id];
}

export const DEFAULT_PLATFORMS: PlatformId[] = [
  "tiktok-feed",
  "instagram-reels",
  "youtube-shorts",
  "meta-feed-square",
  "meta-feed-portrait",
  "meta-story",
];

export const ITERATION_PLATFORMS: PlatformId[] = ["tiktok-feed"];

// Re-export Platform alias for callers that prefer the shorter name.
export type Platform = PlatformId;

// ---------------------------------------------------------------------------
// Ad profile (analytics foundation). Every render emits one of these next to
// the MP4. command-center later ingests them so we can correlate features
// (hook template, voice provider, palette, cuts/sec, ...) to conversion.
// ---------------------------------------------------------------------------

export type ProfileExternalCall = {
  service:
    | "claude"
    | "edge-tts"
    | "cartesia"
    | "fal-veo"
    | "goapi-suno"
    | "replicate-stable-audio"
    | "pexels"
    | "pixabay";
  duration_ms: number;
  cost_usd: number;
  ok: boolean;
  error: string | null;
};

export type ProfileOutputFile = {
  platform: PlatformId;
  path: string;
  width: number;
  height: number;
  duration_sec: number;
  file_size_mb: number;
  sha256: string;
};

export type ProfileScene = {
  index: number;
  kind: string;
  duration_sec: number;
  headline: string | null;
  subline: string | null;
  voiceover: string | null;
  visual_treatment: string;
  broll_query: string | null;
  ai_clip_prompt: string | null;
  sfx_query: string | null;
  bait_clip_prompt: string | null;
};

export type AdProfile = {
  schema_version: "1.0.0";
  profile_id: string;
  created_at: string;
  pipeline_version: string;

  // Concept
  app_name: string;
  app_one_liner: string;
  app_audience: string;
  app_pain: string;
  app_outcome: string;

  // Creative direction
  hook_template: string;
  hook_template_skeleton: string; // first 200 chars
  humor_flavor: string;
  cta_framing: "loss" | "gain";
  cta_text: string;
  cta_scarcity_tier: string | null;

  // Audio
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

  // Visual
  palette: { primary: string; accent: string; bg: string; fg: string };
  palette_source: "user" | "claude-derived" | "default-by-voicestyle";
  hero_clip_source: "veo" | "none";
  hero_clip_prompt: string | null;
  captions_burned_in: boolean;
  brand_mark_persistent: boolean;
  cuts_per_second: number;
  total_cuts: number;
  sub_cuts_per_scene: Record<string, number>;

  // Scenes
  scenes: ProfileScene[];

  // Output
  target_platforms: PlatformId[];
  output_files: ProfileOutputFile[];

  // Cost + perf
  generation_cost_usd: number;
  generation_time_sec: number;
  external_calls: ProfileExternalCall[];

  // Lint
  lint_pass: boolean;
  lint_hard_failures: string[];
  lint_soft_warnings: string[];
  lint_retry_count: number;

  // Future fields (filled later by command-center)
  linked_campaign_ids: string[];
  performance_snapshots: never[]; // schema-reserved
};
