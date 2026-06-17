import { Easing } from "remotion";

// House entrance curve — same bezier the rest of Thomas's projects use.
export const houseEase = Easing.bezier(0.21, 0.47, 0.32, 0.98);

// Camera glide: gentle in, long settle. Reads as a dolly, not a tween.
export const camEase = Easing.bezier(0.45, 0.05, 0.19, 1);

// Speed ramp for scroll-throughs: slow lead-in, fast middle, soft landing.
export const rampEase = Easing.bezier(0.7, 0.05, 0.16, 1);

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Zoom interpolates in log space so a 1x→2.5x push feels constant-speed.
export const lerpZoom = (a: number, b: number, t: number): number =>
  Math.exp(lerp(Math.log(a), Math.log(b), t));

// Deterministic PRNG — renders must be reproducible frame-for-frame.
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
