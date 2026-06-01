import { AbsoluteFill, Audio, Sequence, Video, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import React, { Fragment } from "react";
import type { AdScript, PlatformSpec, Scene } from "../types";
import { Captions, type CaptionTimestamps } from "./Captions";
import { BrandMark } from "./BrandMark";

export type AppPitchAdProps = {
  script: AdScript;
  scenes: Array<Scene & { audioSrc: string; durationFrames: number; startFrame: number }>;
  fps: number;
  platformSpec: PlatformSpec;
  // Optional premium-tier overlays. Paths are relative to publicDir; resolved
  // through staticFile() at render time.
  musicSrc?: string;
  heroClipSrc?: string;
  // Per-scene word timestamps, parallel to `scenes`. null where unavailable.
  // The render orchestrator reads each scene's audio.timestamps.json into
  // memory and passes it through inputProps so the composition doesn't need
  // to fetch JSON at render time.
  sceneTimestamps?: Array<CaptionTimestamps | null>;
  // Persistent brand badge text. Defaults to `${appName}.com` for the legacy
  // ads that own a real domain. Pass an honest wordmark (e.g. "InvoiceFlow")
  // for app-idea validation ads where we don't own the .com yet.
  brandLabel?: string;
  // CTA scene button label. Defaults to the `${appName}.com` domain; override
  // with a plain action label ("Get Early Access") when there's no live domain.
  ctaLabel?: string;
};

const PALETTES = {
  "confident-warm": { bg: "#0F172A", fg: "#FFFFFF", accent: "#F59E0B" },
  "energetic-young": { bg: "#0B0E14", fg: "#FFFFFF", accent: "#22D3EE" },
  "calm-pro": { bg: "#111827", fg: "#FFFFFF", accent: "#34D399" },
};

// Sub-cut variation picker. Deterministic so renders are stable across runs.
type CutVariant = "punch-in" | "angle-shift" | "bg-swap";
const VARIANTS: CutVariant[] = ["punch-in", "angle-shift", "bg-swap"];
function hashSceneCut(kind: string, idx: number): CutVariant {
  // Cheap string hash — enough to distribute across 3 buckets.
  let h = 0;
  const key = `${kind}|${idx}`;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  const variant = VARIANTS[Math.abs(h) % VARIANTS.length];
  return variant ?? "punch-in";
}

export const AppPitchAd: React.FC<AppPitchAdProps> = ({
  script,
  scenes,
  fps,
  platformSpec,
  musicSrc,
  heroClipSrc,
  sceneTimestamps,
  brandLabel,
  ctaLabel,
}) => {
  const palette = PALETTES[script.voiceStyle];

  // BrandMark hides during the bait scene. Easiest test: scene 0 kind === "bait_clip".
  // Frame >= scenes[0].durationFrames means we've passed the bait into the rest
  // of the ad.
  const baitFrames =
    scenes[0]?.kind === "bait_clip" ? scenes[0]?.durationFrames ?? 0 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Background music plays for the entire composition, sits beneath VO. */}
      {musicSrc && <Audio src={staticFile(musicSrc)} volume={0.25} />}
      {scenes.map((s, i) => {
        // Scene index 1 (the second scene) gets the hero clip background when available.
        const useHero = i === 1 && heroClipSrc;
        const ts = sceneTimestamps?.[i] ?? null;
        const captionsEnabled = s.kind !== "bait_clip" && ts !== null;

        // bait_clip + cta are atomic — no sub-cut split, just one Sequence.
        if (s.kind === "bait_clip" || s.kind === "cta") {
          return (
            <Sequence key={i} from={s.startFrame} durationInFrames={s.durationFrames}>
              {useHero && s.kind !== "bait_clip" && (
                <>
                  <Video
                    src={staticFile(heroClipSrc)}
                    startFrom={0}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.45)" }} />
                </>
              )}
              <SceneRenderer
                scene={s}
                palette={palette}
                fps={fps}
                appName={script.appName}
                ctaLabel={ctaLabel}
                isCta={s.kind === "cta"}
                platformSpec={platformSpec}
                transparentBg={Boolean(useHero) && s.kind !== "bait_clip"}
                cutHalf={null}
                variant={null}
              />
              {s.audioSrc ? <Audio src={staticFile(s.audioSrc)} /> : null}
              {captionsEnabled && ts && (
                <Captions
                  audioStartFrame={0}
                  durationFrames={s.durationFrames}
                  fps={fps}
                  timestamps={ts}
                  platformSpec={platformSpec}
                  accentColor={palette.accent}
                  enabled={captionsEnabled}
                />
              )}
            </Sequence>
          );
        }

        // Split everything else into two sub-cut halves at the midpoint frame.
        // Audio + captions still mount across the full duration so VO timing is
        // untouched; only the visual gets the cut.
        const halfDur = Math.floor(s.durationFrames / 2);
        const variant = hashSceneCut(s.kind, i);
        return (
          <Fragment key={i}>
            <Sequence from={s.startFrame} durationInFrames={halfDur}>
              {useHero && (
                <>
                  <Video
                    src={staticFile(heroClipSrc)}
                    startFrom={0}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.45)" }} />
                </>
              )}
              <SceneRenderer
                scene={s}
                palette={palette}
                fps={fps}
                appName={script.appName}
                isCta={false}
                platformSpec={platformSpec}
                transparentBg={Boolean(useHero)}
                cutHalf={0}
                variant={variant}
              />
            </Sequence>
            <Sequence from={s.startFrame + halfDur} durationInFrames={s.durationFrames - halfDur}>
              {useHero && (
                <>
                  <Video
                    src={staticFile(heroClipSrc)}
                    startFrom={halfDur / fps}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.45)" }} />
                </>
              )}
              <SceneRenderer
                scene={s}
                palette={palette}
                fps={fps}
                appName={script.appName}
                isCta={false}
                platformSpec={platformSpec}
                transparentBg={Boolean(useHero)}
                cutHalf={1}
                variant={variant}
              />
            </Sequence>
            {/* Audio mounts ONCE across the full scene — sub-cut visuals must not affect VO timing. */}
            <Sequence from={s.startFrame} durationInFrames={s.durationFrames}>
              {s.audioSrc ? <Audio src={staticFile(s.audioSrc)} /> : null}
              {captionsEnabled && ts && (
                <Captions
                  audioStartFrame={0}
                  durationFrames={s.durationFrames}
                  fps={fps}
                  timestamps={ts}
                  platformSpec={platformSpec}
                  accentColor={palette.accent}
                  enabled={captionsEnabled}
                />
              )}
            </Sequence>
          </Fragment>
        );
      })}
      {/* Persistent BrandMark — mounted once at the composition level so it
          appears across every scene EXCEPT the bait clip. We wrap it in a
          Sequence that starts after the bait so it simply doesn't exist during
          scene 0. */}
      <Sequence from={baitFrames}>
        <BrandMark
          appName={script.appName}
          label={brandLabel}
          platformSpec={platformSpec}
          accentColor={palette.accent}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

const SceneRenderer: React.FC<{
  scene: Scene & { durationFrames: number };
  palette: typeof PALETTES["confident-warm"];
  fps: number;
  appName: string;
  ctaLabel?: string;
  isCta: boolean;
  platformSpec: PlatformSpec;
  transparentBg?: boolean;
  cutHalf: 0 | 1 | null;
  variant: CutVariant | null;
}> = ({ scene, palette, fps, appName, ctaLabel, isCta, platformSpec, transparentBg = false, cutHalf, variant }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // bait_clip is the entire visual — no overlays, no chrome, no entrance fade.
  if (scene.kind === "bait_clip" && scene.bait_clip_path) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <Video
          src={staticFile(scene.bait_clip_path)}
          startFrom={0}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        {scene.bait_caption && (
          <AbsoluteFill
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              paddingBottom: Math.min(width, height) * 0.22,
              paddingLeft: 32,
              paddingRight: 32,
            }}
          >
            <p
              style={{
                color: "rgba(255,255,255,0.92)",
                fontSize: 32 * (Math.min(width, height) / 1080),
                fontWeight: 600,
                margin: 0,
                textAlign: "center",
                textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                letterSpacing: "-0.01em",
              }}
            >
              {scene.bait_caption}
            </p>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  }

  // Hook + bait_clip render at full opacity from frame 0. Other kinds keep the
  // spring-based entrance.
  const skipEntrance = scene.kind === "hook" || scene.kind === "bait_clip";
  const enter = skipEntrance
    ? 1
    : spring({ frame, fps, config: { damping: 12, mass: 0.6, stiffness: 80 } });
  const headlineY = skipEntrance ? 0 : interpolate(enter, [0, 1], [40, 0]);
  const headlineOpacity = skipEntrance ? 1 : enter;

  const sublineDelay = 8;
  const sublineEnter = skipEntrance
    ? 1
    : spring({
        frame: Math.max(0, frame - sublineDelay),
        fps,
        config: { damping: 14, mass: 0.6, stiffness: 80 },
      });

  // Scale typography to canvas size — base sizes were tuned for 1080x1920.
  // Use the smaller dimension so square/landscape don't get monstrous text.
  const baseDim = Math.min(width, height);
  const scale = baseDim / 1080;

  const accentBarWidth = skipEntrance ? width * 0.18 : interpolate(enter, [0, 1], [0, width * 0.18]);

  // Sub-cut visual variation. Only applied on the second half (cutHalf === 1).
  const isSecondHalf = cutHalf === 1;
  const cutTransform = isSecondHalf && variant === "punch-in"
    ? "scale(1.18)"
    : isSecondHalf && variant === "angle-shift"
      ? "rotate(1.5deg) translateX(20px)"
      : undefined;
  const swappedBg = isSecondHalf && variant === "bg-swap" ? palette.accent : undefined;

  return (
    <AbsoluteFill
      style={{
        // When hero clip is the background, suppress the SceneRenderer's own bg paint
        // so the video shows through. Otherwise the parent palette bg already covers it.
        // bg-swap variant flips to the accent color for the second half.
        backgroundColor: transparentBg ? "transparent" : swappedBg,
        paddingTop: platformSpec.safe_top_px,
        paddingBottom: platformSpec.safe_bottom_px,
        paddingLeft: platformSpec.safe_left_px,
        paddingRight: platformSpec.safe_right_px,
        transform: cutTransform,
        transformOrigin: "center center",
      }}
    >
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 * scale, maxWidth: 1100 * scale }}>
          <div style={{ height: 4 * scale, width: accentBarWidth, backgroundColor: palette.accent, borderRadius: 2 }} />
          <h1
            style={{
              fontSize: (isCta ? 100 : 88) * scale,
              fontWeight: 800,
              color: palette.fg,
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              margin: 0,
              transform: `translateY(${headlineY}px)`,
              opacity: headlineOpacity,
            }}
          >
            {scene.headline}
          </h1>
          {scene.subline && (
            <p
              style={{
                fontSize: 36 * scale,
                color: "rgba(255,255,255,0.72)",
                margin: 0,
                opacity: sublineEnter,
                transform: `translateY(${skipEntrance ? 0 : interpolate(sublineEnter, [0, 1], [16, 0])}px)`,
              }}
            >
              {scene.subline}
            </p>
          )}
          {isCta && (
            <div
              style={{
                marginTop: 16 * scale,
                padding: `${20 * scale}px ${36 * scale}px`,
                backgroundColor: palette.accent,
                color: palette.bg,
                fontSize: 32 * scale,
                fontWeight: 700,
                borderRadius: 999,
                alignSelf: "flex-start",
                opacity: sublineEnter,
              }}
            >
              {ctaLabel ?? `${appName.toLowerCase().replace(/\s+/g, "")}.com`}
            </div>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
