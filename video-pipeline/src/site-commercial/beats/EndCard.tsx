import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EndCardBeat } from "../types";
import { houseEase } from "../lib/motion";

const FONT_STACK = '"Inter", "Helvetica Neue", "Arial", "Segoe UI", sans-serif';

interface EndCardProps {
  beat: EndCardBeat;
  accent: string;
  fg: string;
  bg: string;
}

// Closer: mark, domain, one-line ask. Calm and certain — the loud part of
// the ad is already over.
export const EndCard: React.FC<EndCardProps> = ({ beat, accent, fg, bg }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const tIn = (delaySec: number, lenSec: number) =>
    interpolate(
      frame,
      [Math.round(delaySec * fps), Math.round((delaySec + lenSec) * fps)],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: houseEase },
    );

  const logoT = tIn(0, 0.5);
  const domainT = tIn(0.28, 0.45);
  const ctaT = tIn(0.55, 0.45);

  const logoSize = Math.round(Math.min(width, height) * 0.26);
  const domainSize = Math.round(width * 0.062);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle ${logoSize * 2.2}px at 50% ${height * 0.42}px, rgba(255,255,255,${0.06 * logoT}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />
      <Img
        src={staticFile(beat.logoSrc)}
        style={{
          width: logoSize,
          height: logoSize,
          opacity: logoT,
          transform: `scale(${0.92 + 0.08 * logoT})`,
        }}
      />
      <div
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: domainSize,
          letterSpacing: "-0.01em",
          color: fg,
          marginTop: Math.round(height * 0.04),
          opacity: domainT,
          transform: `translateY(${(1 - domainT) * domainSize * 0.4}px)`,
        }}
      >
        {beat.domain}
      </div>
      {beat.cta ? (
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 600,
            fontSize: Math.round(width * 0.032),
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: accent,
            marginTop: Math.round(height * 0.022),
            opacity: ctaT,
            transform: `translateY(${(1 - ctaT) * 12}px)`,
          }}
        >
          {beat.cta}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
