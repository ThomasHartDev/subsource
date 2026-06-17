import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import React from "react";
import type { PlatformSpec } from "../types";
import { BrandMark } from "./BrandMark";

export type VeoShot = {
  clipPath: string; // relative to publicDir
  audioPath: string | null; // relative to publicDir, null if no VO
  durationSec: number;
  onScreenText?: string | null;
};

export type VeoAdProps = {
  shots: VeoShot[];
  endCardText: string;
  appName: string;
  platformSpec: PlatformSpec;
  fps: number;
};

// Keep accent stable for the v4 comparison runs. The brief doesn't carry a
// voiceStyle, so we pick a single accent color that pairs with most footage.
const ACCENT = "#F59E0B";
const END_CARD_FRAMES = 60; // 2s @ 30fps. Composition fps may differ; we still want a 2-ish-second tail overlay.

export const VeoAd: React.FC<VeoAdProps> = ({
  shots,
  endCardText,
  appName,
  platformSpec,
  fps,
}) => {
  // Sequence shots back-to-back at their declared durations.
  const shotFrames = shots.map((s) => Math.max(1, Math.round(s.durationSec * fps)));
  const totalFrames = shotFrames.reduce((a, b) => a + b, 0);
  const endCardStart = Math.max(0, totalFrames - Math.round((END_CARD_FRAMES / 30) * fps));

  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "Inter, system-ui, sans-serif" }}>
      {shots.map((shot, i) => {
        const startFrame = cursor;
        const durationFrames = shotFrames[i] ?? Math.round(shot.durationSec * fps);
        cursor += durationFrames;
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={durationFrames}
            layout="none"
          >
            <Video
              src={staticFile(shot.clipPath)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            {shot.audioPath && <Audio src={staticFile(shot.audioPath)} />}
            {shot.onScreenText && (
              <KineticCaption text={shot.onScreenText} platformSpec={platformSpec} />
            )}
          </Sequence>
        );
      })}

      {/* Persistent BrandMark across the entire composition. */}
      <BrandMark appName={appName} platformSpec={platformSpec} accentColor={ACCENT} />

      {/* End-card overlay on the last 2 seconds of the LAST shot. */}
      <Sequence from={endCardStart} durationInFrames={totalFrames - endCardStart}>
        <EndCard text={endCardText} platformSpec={platformSpec} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
};

const KineticCaption: React.FC<{ text: string; platformSpec: PlatformSpec }> = ({
  text,
  platformSpec,
}) => {
  const { width, height } = useVideoConfig();
  const baseDim = Math.min(width, height);
  const scale = baseDim / 1080;
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        paddingBottom: platformSpec.safe_bottom_px + 80 * scale,
        paddingLeft: platformSpec.safe_left_px + 24 * scale,
        paddingRight: platformSpec.safe_right_px + 24 * scale,
        pointerEvents: "none",
      }}
    >
      <p
        style={{
          color: "rgba(255,255,255,0.96)",
          fontSize: 36 * scale,
          fontWeight: 700,
          margin: 0,
          textAlign: "center",
          letterSpacing: "-0.01em",
          textShadow: "0 2px 12px rgba(0,0,0,0.75)",
          lineHeight: 1.15,
        }}
      >
        {text}
      </p>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ text: string; platformSpec: PlatformSpec; fps: number }> = ({
  text,
  platformSpec,
  fps,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const baseDim = Math.min(width, height);
  const scale = baseDim / 1080;

  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.7, stiffness: 90 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translate = interpolate(enter, [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "40%",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.78) 50%, rgba(0,0,0,0) 100%)",
          opacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: platformSpec.safe_left_px + 32 * scale,
          right: platformSpec.safe_right_px + 32 * scale,
          bottom: platformSpec.safe_bottom_px + 80 * scale,
          opacity,
          transform: `translateY(${translate}px)`,
          textAlign: "center",
        }}
      >
        <h2
          style={{
            margin: 0,
            color: ACCENT,
            fontWeight: 800,
            fontSize: 72 * scale,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            textShadow: "0 2px 16px rgba(0,0,0,0.8)",
          }}
        >
          {text}
        </h2>
      </div>
    </AbsoluteFill>
  );
};
