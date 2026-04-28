import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { PlatformSpec } from "../types";

export type BrandMarkProps = {
  appName: string;
  platformSpec: PlatformSpec;
  accentColor: string;
};

// Persistent small badge top-right showing the app's URL. Shows on every scene
// except the bait_clip scene, which the parent decides — this component is
// dumb, the parent just chooses whether to mount it.
export const BrandMark: React.FC<BrandMarkProps> = ({ appName, platformSpec, accentColor }) => {
  const { width, height } = useVideoConfig();
  const baseDim = Math.min(width, height);
  const scale = baseDim / 1080;

  const url = `${appName.toLowerCase().replace(/\s+/g, "")}.com`;
  const fontSize = 18 * scale;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: platformSpec.safe_top_px + 20 * scale,
          right: platformSpec.safe_right_px + 20 * scale,
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          borderRadius: 999,
          padding: `${8 * scale}px ${16 * scale}px`,
          opacity: 0.85,
          backdropFilter: "blur(6px)",
        }}
      >
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 700,
            fontSize,
            color: accentColor,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {url}
        </span>
      </div>
    </AbsoluteFill>
  );
};
