/**
 * InFrameBrandMark — CSS overlay that replaces Veo's botched "LINKEDITCH.COM"
 * hand-painted sign in shot 3.
 *
 * Positioned at the approximate pixel location of the sign in the Veo footage.
 * The clay wobble causes a few pixels of drift — intentional "sticker overlay"
 * read. Motion-tracked version is v6 scope.
 *
 * Colour: white fill + 1.5px dark stroke reads on both cream sky and red mailbox.
 */
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import React from "react";
import { fontFamily } from "./font";

const ENTER_CURVE = Easing.bezier(0.21, 0.47, 0.32, 0.98);

type InFrameBrandMarkProps = {
  text?: string;
  /** Percent of frame width (0-100) for horizontal centre. */
  xPercent?: number;
  /** Percent of frame height (0-100) for vertical centre. */
  yPercent?: number;
};

export const InFrameBrandMark: React.FC<InFrameBrandMarkProps> = ({
  text = "LINKEDITCH.COM",
  xPercent = 50,
  yPercent = 72,
}) => {
  const frame = useCurrentFrame();

  // Entrance: fade + subtle slide up over 10 frames.
  const enterOpacity = interpolate(frame, [0, 10], [0, 1], {
    easing: ENTER_CURVE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const enterTranslate = interpolate(frame, [0, 10], [8, 0], {
    easing: ENTER_CURVE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: `${xPercent}%`,
          top: `${yPercent}%`,
          transform: `translate(-50%, -50%) translateY(${enterTranslate}px)`,
          opacity: enterOpacity,
          fontFamily,
          fontWeight: 700,
          fontSize: "5.5%", // ~59px at 1080w
          color: "#FFFFFF",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          whiteSpace: "nowrap",
          WebkitTextStroke: "1.5px #1A1A1A",
          // Sub-pixel sharpening to hold up against H.264 chroma compression.
          textShadow: "0 0 0.5px rgba(0,0,0,0.3)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
