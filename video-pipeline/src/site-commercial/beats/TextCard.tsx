import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { TextCardBeat } from "../types";
import { KineticText } from "../KineticText";

interface TextCardProps {
  beat: TextCardBeat;
  accent: string;
  fg: string;
  bg: string;
}

// Full-frame statement beat on the brand background. Lets the edit breathe
// between site shots and lands the core claim with nothing competing.
export const TextCard: React.FC<TextCardProps> = ({ beat, accent, fg, bg }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durFrames = Math.round(beat.durationSec * fps);
  const glow = Math.min(1, frame / (fps * 0.5));

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${width * 0.7}px ${height * 0.4}px at 50% 50%, rgba(255,255,255,${0.05 * glow}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />
      <KineticText
        overlay={{
          headline: beat.headline,
          sub: beat.sub,
          position: "center",
          align: "center",
          enterSec: 0.12,
          holdToEnd: false,
        }}
        accent={accent}
        fg={fg}
        beatDurationInFrames={durFrames}
      />
    </AbsoluteFill>
  );
};
