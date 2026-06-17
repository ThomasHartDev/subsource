import React, { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { preloadFont } from "troika-three-text";
import type { AudioCue, Spec3D } from "../types3d";
import { buildJourney, type Journey } from "./journey";
import { FONT_BOLD, FONT_REG, Starfield, StopRenderer } from "./set-pieces";

// warm troika's glyph cache before the canvas mounts — inside the R3F tree a
// delayRender never resolves (frame gating deadlock), out here it's safe
const useFontPreload = () => {
  const [handle] = useState(() => delayRender("preloading troika fonts"));
  useEffect(() => {
    let remaining = 2;
    for (const font of [FONT_BOLD, FONT_REG]) {
      try {
        preloadFont({ font: staticFile(font), characters: "abc" }, () => {
          remaining -= 1;
          if (remaining === 0) continueRender(handle);
        });
      } catch (err) {
        cancelRender(err);
      }
    }
  }, [handle]);
};

const BG = "#050608";

const CameraRig: React.FC<{ journey: Journey; frame: number }> = ({ journey, frame }) => {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const state = journey.camera(frame);
  camera.position.copy(state.position);
  camera.lookAt(state.target);
  camera.rotateZ(state.roll);
  camera.fov = 58;
  camera.near = 0.1;
  camera.far = 80;
  camera.updateProjectionMatrix();
  return null;
};

const cueVolume = (cue: AudioCue, localSec: number): number => {
  const pts = cue.volume;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (localSec <= first[0]) return first[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, v0] = pts[i]!;
    const [t1, v1] = pts[i + 1]!;
    if (localSec <= t1) {
      return v0 + ((localSec - t0) / Math.max(1e-6, t1 - t0)) * (v1 - v0);
    }
  }
  return last[1];
};

export type SiteCommercial3DProps = {
  spec: Spec3D;
};

export const SiteCommercial3D: React.FC<SiteCommercial3DProps> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const journey = useMemo(() => buildJourney(spec), [spec]);
  useFontPreload();

  const fadeIn = interpolate(frame, [0, Math.round(fps * 0.5)], [1, 0], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - Math.round(fps * 0.7), durationInFrames - 1],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <ThreeCanvas
        width={width}
        height={height}
        gl={{ antialias: true, alpha: false }}
        style={{ width, height }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 9, 34]} />
        <CameraRig journey={journey} frame={frame} />
        <Starfield depth={journey.placed.length * 17} frame={frame} />
        <StopRenderer journey={journey} spec={spec} frame={frame} />
      </ThreeCanvas>
      {/* gentle vignette so edges fall away like a graded shot */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 88% 88% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.42) 100%)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{ backgroundColor: "#000", opacity: Math.max(fadeIn, fadeOut), pointerEvents: "none" }}
      />
      {spec.audio.map((cue, i) => (
        <Sequence key={i} from={Math.round(cue.atSec * fps)}>
          <Audio src={staticFile(cue.src)} volume={(f) => cueVolume(cue, f / fps)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
