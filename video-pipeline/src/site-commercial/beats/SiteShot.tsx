import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { SiteShotBeat } from "../types";
import { camEase, clamp01, lerp, lerpZoom } from "../lib/motion";
import { KineticText } from "../KineticText";

interface SiteShotProps {
  beat: SiteShotBeat;
  accent: string;
  fg: string;
  bg: string;
}

// One camera move over a website capture: dolly between two keyframes
// (center + zoom in source pixels). All motion happens here, at render
// fps, so it's perfectly smooth no matter how the site scrolls.
export const SiteShot: React.FC<SiteShotProps> = ({ beat, accent, fg, bg }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durFrames = Math.round(beat.durationSec * fps);

  const t = camEase(clamp01(frame / Math.max(1, durFrames - 1)));
  const zoom = lerpZoom(beat.from.zoom, beat.to.zoom, t);
  const cx = lerp(beat.from.cx, beat.to.cx, t);
  const cy = lerp(beat.from.cy, beat.to.cy, t);

  // zoom=1 → image width fills frame width
  const s = zoom * (width / beat.imageW);
  const tx = width / 2 - cx * s;
  const ty = height / 2 - cy * s;

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
      {/* gentle edge vignette keeps focus center-frame */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.32) 100%)",
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
