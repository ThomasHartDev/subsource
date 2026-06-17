import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Overlay } from "./types";
import { houseEase } from "./lib/motion";

const FONT_STACK =
  '"Inter", "Helvetica Neue", "Arial", "Segoe UI", sans-serif';

interface KineticTextProps {
  overlay: Overlay;
  accent: string;
  fg: string;
  // beat length so the exit can anchor to the cut
  beatDurationInFrames: number;
}

// Word-staggered headline with a sweeping accent rule and a contrast plate
// so it stays legible over any website capture.
export const KineticText: React.FC<KineticTextProps> = ({
  overlay,
  accent,
  fg,
  beatDurationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const enter = Math.round(overlay.enterSec * fps);
  const wordStagger = Math.max(2, Math.round(fps * 0.055));
  const wordRise = Math.round(fps * 0.28);
  const exitLen = Math.round(fps * 0.32);
  const exitStart = overlay.holdToEnd
    ? Number.MAX_SAFE_INTEGER
    : beatDurationInFrames - exitLen - Math.round(fps * 0.08);

  const exitT = interpolate(frame, [exitStart, exitStart + exitLen], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: houseEase,
  });

  const words = overlay.headline.split(/\s+/);
  const headlineSize = Math.round(width * (overlay.position === "center" ? 0.085 : 0.072));
  const subSize = Math.round(width * 0.034);
  const pad = Math.round(width * 0.08);

  const lastWordIn = enter + (words.length - 1) * wordStagger + wordRise;
  const ruleT = interpolate(frame, [lastWordIn - 6, lastWordIn + Math.round(fps * 0.3)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: houseEase,
  });
  const subT = interpolate(frame, [lastWordIn, lastWordIn + Math.round(fps * 0.35)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: houseEase,
  });

  const vertical: React.CSSProperties =
    overlay.position === "lower"
      ? { justifyContent: "flex-end", paddingBottom: Math.round(height * 0.1) }
      : overlay.position === "upper"
        ? { justifyContent: "flex-start", paddingTop: Math.round(height * 0.12) }
        : { justifyContent: "center" };

  // plates are tuned for the worst case (white text over a white site
  // section); on dark captures they just read as a tasteful vignette
  const plate =
    overlay.position === "lower"
      ? "linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.72) 55%, rgba(0,0,0,0) 100%)"
      : overlay.position === "upper"
        ? "linear-gradient(180deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.72) 55%, rgba(0,0,0,0) 100%)"
        : "radial-gradient(ellipse 75% 45% at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)";

  const plateOpacity = interpolate(frame, [enter - 4, enter + wordRise], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* plain div, not AbsoluteFill: AbsoluteFill pins height:100%, which
          silently stretches a top-offset plate to double height and dilutes
          the gradient where the text actually sits */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: overlay.position === "center" ? "100%" : "50%",
          ...(overlay.position === "upper" ? { top: 0 } : { bottom: 0 }),
          background: plate,
          opacity: plateOpacity * (1 - exitT),
        }}
      />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: overlay.align === "center" ? "center" : "flex-start",
          paddingLeft: pad,
          paddingRight: pad,
          opacity: 1 - exitT,
          transform: `translateY(${-exitT * height * 0.012}px)`,
          ...vertical,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: overlay.align === "center" ? "center" : "flex-start",
            columnGap: headlineSize * 0.26,
            maxWidth: "100%",
          }}
        >
          {words.map((word, i) => {
            const start = enter + i * wordStagger;
            const t = interpolate(frame, [start, start + wordRise], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: houseEase,
            });
            return (
              <span
                key={`${word}-${i}`}
                style={{
                  fontFamily: FONT_STACK,
                  fontWeight: 800,
                  fontSize: headlineSize,
                  lineHeight: 1.08,
                  letterSpacing: "-0.02em",
                  color: fg,
                  textShadow: "0 2px 24px rgba(0,0,0,0.45)",
                  opacity: t,
                  transform: `translateY(${(1 - t) * headlineSize * 0.45}px)`,
                  display: "inline-block",
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
        <div
          style={{
            height: Math.max(4, Math.round(width * 0.0055)),
            width: Math.round(width * 0.14),
            background: accent,
            borderRadius: 2,
            marginTop: Math.round(headlineSize * 0.32),
            transform: `scaleX(${ruleT})`,
            transformOrigin: overlay.align === "center" ? "center" : "left",
          }}
        />
        {overlay.sub ? (
          <div
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 500,
              fontSize: subSize,
              letterSpacing: "0.01em",
              lineHeight: 1.35,
              color: "rgba(255,255,255,0.92)",
              textShadow: "0 1px 12px rgba(0,0,0,0.5)",
              marginTop: Math.round(headlineSize * 0.3),
              maxWidth: Math.round(width * 0.78),
              textAlign: overlay.align === "center" ? "center" : "left",
              opacity: subT,
              transform: `translateY(${(1 - subT) * subSize * 0.6}px)`,
            }}
          >
            {overlay.sub}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
