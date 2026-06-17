import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ScrollBeat } from "../types";
import { clamp01, lerp, rampEase } from "../lib/motion";
import { KineticText } from "../KineticText";

interface ScrollThroughProps {
  beat: ScrollBeat;
  accent: string;
  fg: string;
  bg: string;
}

// Speed-ramped flythrough down a full-page capture. The window tops
// (fromY/toY) are in source pixels; easing makes it lead in slow, rip
// through the middle, and land soft.
export const ScrollThrough: React.FC<ScrollThroughProps> = ({ beat, accent, fg, bg }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durFrames = Math.round(beat.durationSec * fps);

  const t = rampEase(clamp01(frame / Math.max(1, durFrames - 1)));
  const s = beat.zoom * (width / beat.imageW);
  const y = lerp(beat.fromY, beat.toY, t);

  const tx = (width - beat.imageW * s) / 2;
  const ty = -y * s;

  return (
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden" }}>
      <Img
        src={staticFile(beat.src)}
        style={{
          position: "absolute",
          width: beat.imageW,
          height: beat.imageH,
          maxWidth: "none",
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      />
      {/* top/bottom falloff sells the speed without real motion blur */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 86%, rgba(0,0,0,0.30) 100%)",
        }}
      />
      {beat.overlay ? (
        <KineticText
          overlay={beat.overlay}
          accent={accent}
          fg={fg}
          beatDurationInFrames={durFrames}
        />
      ) : null}
    </AbsoluteFill>
  );
};
