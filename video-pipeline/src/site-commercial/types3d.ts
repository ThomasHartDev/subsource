import { z } from "zod";

// ---- Spec v2: the 3D continuous-shot journey ----
//
// A journey is an ordered list of stops in a black void. The camera never
// cuts: it flies one eased spline past every stop, lingering at each and
// ripping between them. Stops are set pieces — site captures as glowing
// monoliths, generated review cards, neon ring tunnels, text moments —
// so the commercial can show things that aren't literally on the page.

export const reviewSchema = z.object({
  stars: z.number().int().min(1).max(5).default(5),
  quote: z.string(),
  name: z.string(),
  role: z.string().optional(),
});

const stopCommon = {
  // how long the camera spends owning this stop (approach + linger)
  durationSec: z.number().positive().default(3),
};

export const logoStopSchema = z.object({
  kind: z.literal("logo-emblem"),
  ...stopCommon,
  logoSrc: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
});

export const monolithStopSchema = z.object({
  kind: z.literal("site-monolith"),
  ...stopCommon,
  src: z.string(),
  imageW: z.number().positive(),
  imageH: z.number().positive(),
  headline: z.string().optional(),
  sub: z.string().optional(),
});

export const tunnelStopSchema = z.object({
  kind: z.literal("ring-tunnel"),
  ...stopCommon,
  text: z.string().optional(),
});

export const reviewFieldStopSchema = z.object({
  kind: z.literal("review-field"),
  ...stopCommon,
  headline: z.string().optional(),
  reviews: z.array(reviewSchema).min(1).max(6),
});

export const textMomentStopSchema = z.object({
  kind: z.literal("text-moment"),
  ...stopCommon,
  headline: z.string(),
  sub: z.string().optional(),
});

export const finaleStopSchema = z.object({
  kind: z.literal("finale"),
  ...stopCommon,
  logoSrc: z.string(),
  domain: z.string(),
  cta: z.string().optional(),
  // panel textures arranged in the closing ring
  panelSrcs: z.array(z.string()).max(10).default([]),
});

export const stopSchema = z.discriminatedUnion("kind", [
  logoStopSchema,
  monolithStopSchema,
  tunnelStopSchema,
  reviewFieldStopSchema,
  textMomentStopSchema,
  finaleStopSchema,
]);

// Timed audio layer: tracks enter at cue points with volume envelopes, so
// music and SFX hit with the camera instead of just playing underneath.
export const audioCueSchema = z.object({
  src: z.string(),
  atSec: z.number().min(0).default(0),
  // piecewise-linear volume automation in TRACK-local seconds
  volume: z
    .array(z.tuple([z.number().min(0), z.number().min(0).max(2)]))
    .min(1)
    .default([[0, 0.8]]),
});

export const spec3dSchema = z.object({
  name: z.string(),
  format: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  fps: z.union([z.literal(30), z.literal(60)]).default(60),
  brand: z.object({
    name: z.string(),
    accent: z.string().default("#FFD400"),
    accent2: z.string().optional(),
    fg: z.string().default("#EDEEF0"),
  }),
  audio: z.array(audioCueSchema).default([]),
  journey: z.array(stopSchema).min(2),
});

export type Spec3D = z.infer<typeof spec3dSchema>;
export type Stop = z.infer<typeof stopSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type AudioCue = z.infer<typeof audioCueSchema>;

export const spec3dDurationInFrames = (spec: Spec3D): number =>
  spec.journey.reduce((sum, s) => sum + Math.round(s.durationSec * spec.fps), 0);
