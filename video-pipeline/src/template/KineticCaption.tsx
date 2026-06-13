/**
 * KineticCaption — word-by-word reveal captions synced to VO phrase peaks.
 *
 * Research doc rule: string-slice per word, NOT per character (per-character
 * looks like an AI ad). 8px → 0px slide-in over 6 frames per word, words
 * staggered 4 frames apart. Only used after t=6s when the visual hook lands.
 *
 * Timings are baked — Cartesia uses even-distribution estimation, not real
 * word timestamps. Loose phrase-boundary sync is intentional (hard syllable
 * sync looks fake; phrase-peak sync looks deliberate).
 */
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import React from "react";
import { fontFamily } from "./font";

const ENTER_CURVE = Easing.bezier(0.21, 0.47, 0.32, 0.98);

export type CaptionPhrase = {
  /** The phrase text. Rendered word-by-word. */
  text: string;
  /** Frame (relative to composition start) when the first word appears. */
  startFrame: number;
  /** Total frames this phrase is visible. Hidden when exceeded. */
  durationFrames: number;
};

type KineticCaptionProps = {
  phrases: CaptionPhrase[];
};

const WordReveal: React.FC<{
  words: string[];
  /** Frame relative to phrase start when first word enters. */
}> = ({ words }) => {
  const frame = useCurrentFrame(); // local frame within the phrase Sequence
  const { width, height } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;

  return (
    <div
      style={{
        display: "flex",
        gap: "0.25em",
        flexWrap: "wrap",
        justifyContent: "center",
        fontFamily,
        fontWeight: 700,
        fontSize: 52 * scale,
        color: "#FFFFFF",
        letterSpacing: "-0.01em",
        lineHeight: 1.1,
        maxWidth: "82%",
        textAlign: "center",
        WebkitTextStroke: `1px #1A1A1A`,
        textShadow: "0 2px 8px rgba(0,0,0,0.6)",
      }}
    >
      {words.map((word, i) => {
        const wordStart = i * 4;
        const wordEnd = wordStart + 6;
        const opacity = interpolate(frame, [wordStart, wordEnd], [0, 1], {
          easing: ENTER_CURVE,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const slide = interpolate(frame, [wordStart, wordEnd], [8, 0], {
          easing: ENTER_CURVE,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              opacity,
              transform: `translateY(${slide}px)`,
              display: "inline-block",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

export const KineticCaption: React.FC<KineticCaptionProps> = ({ phrases }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;

  // Find whichever phrase is currently active.
  const active = phrases.find(
    (p) => frame >= p.startFrame && frame < p.startFrame + p.durationFrames,
  );

  if (!active) return null;

  const localFrame = frame - active.startFrame;
  const words = active.text.split(/\s+/);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: height * 0.18 + 20 * scale,
        pointerEvents: "none",
      }}
    >
      {/* Scoped local frame via key — remounts when phrase changes */}
      <WordReveal key={active.startFrame} words={words} />
    </AbsoluteFill>
  );
};

/**
 * Default baked phrase timings for the LinkedItch VO.
 *
 * VO: "On the job search? Never send another application again. LinkedItch
 * uses your profile to automatically apply to jobs on all job boards. It even
 * generates unique cover letters per application to give you the best chance
 * at a reply. Try for free today."  (~17s)
 *
 * Shot boundaries (6s each @ 30fps): 0, 180, 360.
 * Captions start after shot 1 (the visual hook, no text during first 6s).
 */
export const LINKEDITCH_CAPTION_PHRASES: CaptionPhrase[] = [
  // Shot 2 (~8s in): "automatically apply — all job boards"
  {
    text: "apply to all job boards automatically",
    startFrame: 240, // ~8s
    durationFrames: 90, // 3s
  },
  // Shot 3 (~13s in): "unique cover letter every application"
  {
    text: "unique cover letter every application",
    startFrame: 390, // ~13s
    durationFrames: 75, // 2.5s
  },
];
