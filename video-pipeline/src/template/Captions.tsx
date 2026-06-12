import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { PlatformSpec } from "../types";
import { resolveSafeZone } from "./safe-zones";

export type CaptionTimestamps = {
  words: string[];
  starts: number[];
  ends: number[];
};

export type CaptionsProps = {
  // Frame within the parent <Sequence> at which this scene's audio starts.
  // For our pipeline that's effectively 0 since each scene's audio is mounted
  // at the start of its own Sequence, but keep it explicit so callers can
  // offset captions if they ever pre-roll the audio.
  audioStartFrame: number;
  durationFrames: number;
  fps: number;
  timestamps: CaptionTimestamps;
  platformSpec: PlatformSpec;
  accentColor: string;
  enabled: boolean;
};

// Kinetic-typography captions: one word at a time, large, bold, accent color.
// Sits above the platform's bottom safe zone so it doesn't get clipped by
// in-feed UI on TikTok / Reels / Shorts.
export const Captions: React.FC<CaptionsProps> = ({
  audioStartFrame,
  durationFrames,
  fps,
  timestamps,
  platformSpec,
  accentColor,
  enabled,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  if (!enabled) return null;
  if (!timestamps || timestamps.words.length === 0) return null;
  if (frame < audioStartFrame) return null;
  if (frame >= audioStartFrame + durationFrames) return null;

  const currentSec = (frame - audioStartFrame) / fps;

  // Find the active word. Linear scan is fine — typical scene has < 30 words.
  let activeIdx = -1;
  for (let i = 0; i < timestamps.words.length; i++) {
    const start = timestamps.starts[i] ?? 0;
    const end = timestamps.ends[i] ?? start;
    if (currentSec >= start && currentSec < end) {
      activeIdx = i;
      break;
    }
  }
  // If the audio ran a hair past the last end timestamp, keep showing the last word.
  if (activeIdx === -1) {
    const lastEnd = timestamps.ends[timestamps.ends.length - 1] ?? 0;
    if (currentSec >= lastEnd) activeIdx = timestamps.words.length - 1;
  }
  if (activeIdx === -1) return null;

  const word = timestamps.words[activeIdx]!;

  // Type scales relative to a 1080p reference. Match SceneRenderer's approach
  // so captions feel proportional across square / portrait / landscape outputs.
  const baseDim = Math.min(width, height);
  const scale = baseDim / 1080;
  const fontSize = 48 * scale * 1.4; // a touch chunkier than supporting text

  // Subtle pop animation when a new word becomes active.
  const wordStartSec = timestamps.starts[activeIdx] ?? 0;
  const wordStartFrame = audioStartFrame + Math.round(wordStartSec * fps);
  const sincePop = Math.max(0, frame - wordStartFrame);
  const popScale = interpolate(sincePop, [0, 4], [0.92, 1], {
    extrapolateRight: "clamp",
  });
  const popOpacity = interpolate(sincePop, [0, 3], [0.4, 1], {
    extrapolateRight: "clamp",
  });

  // Bottom position: above the resolved safe zone with a comfortable gap so
  // captions don't kiss the chrome (or the canvas edge on square/landscape).
  const safe = resolveSafeZone(platformSpec);
  const bottomPx = safe.bottom + 80 * scale;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: bottomPx,
        paddingLeft: safe.left + 24 * scale,
        paddingRight: safe.right + 24 * scale,
      }}
    >
      <div
        style={{
          // Subtle dark scrim behind the word for contrast on photo / video bg.
          backgroundColor: "rgba(0, 0, 0, 0.55)",
          borderRadius: 14 * scale,
          padding: `${14 * scale}px ${24 * scale}px`,
          transform: `scale(${popScale})`,
          opacity: popOpacity,
          boxShadow: `0 4px 24px rgba(0,0,0,0.35)`,
        }}
      >
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 800,
            fontSize,
            color: accentColor,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            textTransform: "uppercase",
            textShadow: "0 2px 12px rgba(0,0,0,0.5)",
            whiteSpace: "nowrap",
          }}
        >
          {word}
        </span>
      </div>
    </AbsoluteFill>
  );
};
