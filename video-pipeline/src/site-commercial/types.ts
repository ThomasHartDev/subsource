import { z } from "zod";

// Canonical social formats. Width/height are render pixels, not display size.
export const FORMATS = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
} as const;

export type FormatId = keyof typeof FORMATS;

// Camera keyframe in SOURCE IMAGE pixels. zoom=1 means the image width
// exactly fills the frame width; zoom=2 shows half the image width.
export const cameraPointSchema = z.object({
  cx: z.number(),
  cy: z.number(),
  zoom: z.number().positive(),
});

export const overlaySchema = z.object({
  headline: z.string(),
  sub: z.string().optional(),
  position: z.enum(["upper", "center", "lower"]).default("lower"),
  align: z.enum(["left", "center"]).default("left"),
  // seconds into the beat before the text starts entering
  enterSec: z.number().min(0).default(0.3),
  // keep the text up through the cut instead of animating out
  holdToEnd: z.boolean().default(false),
});

const beatCommon = {
  durationSec: z.number().positive(),
  transitionIn: z.enum(["cut", "fade", "zoom-punch", "whip"]).default("cut"),
};

export const particleLogoBeatSchema = z.object({
  kind: z.literal("particle-logo"),
  ...beatCommon,
  // white-on-transparent PNG under public/, made by rasterize-logo.mjs
  logoSrc: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
});

export const siteShotBeatSchema = z.object({
  kind: z.literal("site-shot"),
  ...beatCommon,
  // capture PNG under public/, with its real pixel dimensions from manifest.json
  src: z.string(),
  imageW: z.number().positive(),
  imageH: z.number().positive(),
  from: cameraPointSchema,
  to: cameraPointSchema,
  overlay: overlaySchema.optional(),
});

export const scrollBeatSchema = z.object({
  kind: z.literal("scroll-through"),
  ...beatCommon,
  src: z.string(),
  imageW: z.number().positive(),
  imageH: z.number().positive(),
  // window top in source pixels at start/end of the speed-ramped scroll
  fromY: z.number().min(0).default(0),
  toY: z.number().min(0),
  zoom: z.number().positive().default(1),
  overlay: overlaySchema.optional(),
});

export const textCardBeatSchema = z.object({
  kind: z.literal("text-card"),
  ...beatCommon,
  headline: z.string(),
  sub: z.string().optional(),
});

export const endCardBeatSchema = z.object({
  kind: z.literal("end-card"),
  ...beatCommon,
  logoSrc: z.string(),
  domain: z.string(),
  cta: z.string().optional(),
});

export const beatSchema = z.discriminatedUnion("kind", [
  particleLogoBeatSchema,
  siteShotBeatSchema,
  scrollBeatSchema,
  textCardBeatSchema,
  endCardBeatSchema,
]);

export const commercialSpecSchema = z.object({
  name: z.string(),
  format: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  fps: z.union([z.literal(30), z.literal(60)]).default(60),
  brand: z.object({
    name: z.string(),
    accent: z.string().default("#FFD400"),
    bg: z.string().default("#0B0C0E"),
    fg: z.string().default("#EDEEF0"),
  }),
  // optional music bed under public/, plays from 0:00
  audioSrc: z.string().optional(),
  audioVolume: z.number().min(0).max(1).default(0.7),
  beats: z.array(beatSchema).min(1),
});

export type CommercialSpec = z.infer<typeof commercialSpecSchema>;
export type CommercialSpecInput = z.input<typeof commercialSpecSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type ParticleLogoBeat = z.infer<typeof particleLogoBeatSchema>;
export type SiteShotBeat = z.infer<typeof siteShotBeatSchema>;
export type ScrollBeat = z.infer<typeof scrollBeatSchema>;
export type TextCardBeat = z.infer<typeof textCardBeatSchema>;
export type EndCardBeat = z.infer<typeof endCardBeatSchema>;
export type Overlay = z.infer<typeof overlaySchema>;

export const beatFrames = (durationSec: number, fps: number): number =>
  Math.round(durationSec * fps);

export const specDurationInFrames = (spec: CommercialSpec): number =>
  spec.beats.reduce((sum, b) => sum + beatFrames(b.durationSec, spec.fps), 0);
