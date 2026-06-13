/**
 * EndCard — production-quality outro overlay for the LinkedItch claymation ad.
 *
 * Motion language (from production-overlays-research.md):
 *   Frame 0-12:  contrast plate fades in, opacity 0→0.55, curve (0.21,0.47,0.32,0.98)
 *   Frame 4-16:  brand mark enters, scale 0.94→1.0 + opacity 0→1, same curve, 4-frame stagger
 *   Frame 20-32: tagline types on word-by-word, each word a 6-frame opacity ramp staggered 4f
 *   Frame 32-90: hold
 *   Frame 90-102: exit — slide up 16px + opacity 1→0, faster curve (0.4,0,1,1)
 *
 * Based on Apple/Linear teardowns in the research doc: contrast plate does the
 * legibility work, no rectangle border, no drop shadow.
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
const EXIT_CURVE = Easing.bezier(0.4, 0, 1, 1);

type EndCardProps = {
  brandName: string;
  tagline: string;
};

export const EndCard: React.FC<EndCardProps> = ({
  brandName = "LinkedItch",
  tagline = "Try free today",
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const scale = Math.min(width, height) / 1080;

  // Contrast plate — radial darkening behind the text block.
  const plateOpacity = interpolate(frame, [0, 12], [0, 0.55], {
    easing: ENTER_CURVE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Exit: plate fades out with the text.
  const exitOpacity = interpolate(frame, [90, 102], [1, 0], {
    easing: EXIT_CURVE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const combinedPlateOpacity = frame >= 90 ? exitOpacity * 0.55 : plateOpacity;

  // Brand mark entrance (4-frame stagger after the plate).
  const markEnterRaw = interpolate(frame, [4, 16], [0, 1], {
    easing: ENTER_CURVE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const markScale = interpolate(markEnterRaw, [0, 1], [0.94, 1.0]);
  const markOpacity = markEnterRaw;

  // Exit for mark + tagline.
  const exitTranslate = interpolate(frame, [90, 102], [0, 16], {
    easing: EXIT_CURVE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitAlpha = interpolate(frame, [90, 102], [1, 0], {
    easing: EXIT_CURVE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const applyExit = frame >= 90;

  // Word-by-word tagline reveal starting at frame 20.
  const words = tagline.split(" ");

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Radial contrast plate */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 80%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
          opacity: combinedPlateOpacity,
        }}
      />

      {/* Brand mark + tagline container */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingBottom: 120 * scale,
          gap: 16 * scale,
          opacity: applyExit ? exitAlpha : 1,
          transform: applyExit ? `translateY(${exitTranslate}px)` : undefined,
        }}
      >
        {/* Brand mark */}
        <div
          style={{
            fontFamily,
            fontWeight: 800,
            fontSize: 96 * scale,
            color: "#FFFFFF",
            letterSpacing: "-0.025em",
            lineHeight: 1,
            textAlign: "center",
            WebkitTextStroke: `1.5px #1A1A1A`,
            opacity: markOpacity,
            transform: `scale(${markScale})`,
            transformOrigin: "center bottom",
          }}
        >
          {brandName}
        </div>

        {/* Tagline — word-by-word reveal */}
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 64 * scale,
            color: "#FFFFFF",
            letterSpacing: "-0.015em",
            lineHeight: 1.05,
            textAlign: "center",
            WebkitTextStroke: `1px #1A1A1A`,
            display: "flex",
            gap: "0.25em",
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: "78%",
          }}
        >
          {words.map((word, i) => {
            const wordStart = 20 + i * 4;
            const wordEnd = wordStart + 6;
            const wordOpacity = interpolate(frame, [wordStart, wordEnd], [0, 1], {
              easing: ENTER_CURVE,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span key={i} style={{ opacity: wordOpacity }}>
                {word}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
