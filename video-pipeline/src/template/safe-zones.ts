import type { PlatformSpec } from "../types";

export type AspectFamily = "portrait" | "square" | "landscape";

// Which registered composition renders a given platform spec. Portrait keeps
// the legacy "AppPitchAd" id so existing render invocations and saved profiles
// stay valid; square and landscape get their own registrations so the studio
// previews a real canvas and render.ts fans out without dimension-overriding
// a 9:16 comp. 4:5 feed portrait rides the portrait comp — same family, the
// exact dims still come from the per-render composition override.
export const APP_PITCH_COMPOSITION_IDS: Record<AspectFamily, string> = {
  portrait: "AppPitchAd",
  square: "AppPitchAdSquare",
  landscape: "AppPitchAdLandscape",
};

export function aspectFamily(spec: Pick<PlatformSpec, "width" | "height">): AspectFamily {
  if (spec.width === spec.height) return "square";
  return spec.width > spec.height ? "landscape" : "portrait";
}

export interface SafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Design-margin floors per aspect family. platform-specs.json records real
// platform chrome (TikTok's right rail, Reels' caption bar) and the vertical
// feeds have those measured — but every square/landscape spec reports 0 on
// all four edges. Overlays flush against the canvas edge read as a crop bug,
// and YouTube in-stream paints its progress bar + skip button over the bottom
// strip, so each family gets a minimum margin the platform value can raise
// but never lower.
const FAMILY_FLOORS: Record<AspectFamily, SafeZone> = {
  portrait: { top: 0, bottom: 0, left: 0, right: 0 },
  square: { top: 56, bottom: 56, left: 56, right: 56 },
  landscape: { top: 56, bottom: 140, left: 96, right: 96 },
};

export function resolveSafeZone(spec: PlatformSpec): SafeZone {
  const floor = FAMILY_FLOORS[aspectFamily(spec)];
  return {
    top: Math.max(spec.safe_top_px, floor.top),
    bottom: Math.max(spec.safe_bottom_px, floor.bottom),
    left: Math.max(spec.safe_left_px, floor.left),
    right: Math.max(spec.safe_right_px, floor.right),
  };
}
