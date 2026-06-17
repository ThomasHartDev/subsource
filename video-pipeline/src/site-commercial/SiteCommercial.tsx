import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Beat, CommercialSpec } from "./types";
import { beatFrames } from "./types";
import { houseEase } from "./lib/motion";
import { ParticleLogo } from "./beats/ParticleLogo";
import { SiteShot } from "./beats/SiteShot";
import { ScrollThrough } from "./beats/ScrollThrough";
import { TextCard } from "./beats/TextCard";
import { EndCard } from "./beats/EndCard";

// Incoming-beat transition. Cuts at 60fps already read clean; the others add
// energy at the seam without needing overlapping sequences.
const TransitionIn: React.FC<{
  kind: Beat["transitionIn"];
  children: React.ReactNode;
}> = ({ kind, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.round(fps * 0.22);

  if (kind === "cut" || frame >= n) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const t = interpolate(frame, [0, n], [0, 1], {
    extrapolateRight: "clamp",
    easing: houseEase,
  });

  const style: React.CSSProperties =
    kind === "fade"
      ? { opacity: t }
      : kind === "zoom-punch"
        ? { opacity: Math.min(1, t * 2.5), transform: `scale(${1.14 - 0.14 * t})` }
        : {
            // whip
            opacity: Math.min(1, t * 3),
            transform: `translateX(${(1 - t) * 38}%)`,
            filter: `blur(${(1 - t) * 14}px)`,
          };

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

const BeatRenderer: React.FC<{ beat: Beat; spec: CommercialSpec }> = ({ beat, spec }) => {
  const { accent, bg, fg } = spec.brand;
  switch (beat.kind) {
    case "particle-logo":
      return <ParticleLogo beat={beat} accent={accent} fg={fg} bg={bg} />;
    case "site-shot":
      return <SiteShot beat={beat} accent={accent} fg={fg} bg={bg} />;
    case "scroll-through":
      return <ScrollThrough beat={beat} accent={accent} fg={fg} bg={bg} />;
    case "text-card":
      return <TextCard beat={beat} accent={accent} fg={fg} bg={bg} />;
    case "end-card":
      return <EndCard beat={beat} accent={accent} fg={fg} bg={bg} />;
  }
};

// type alias, not interface: Remotion's Composition needs Record<string,
// unknown> compatibility, which interfaces don't get implicitly
export type SiteCommercialProps = {
  spec: CommercialSpec;
};

export const SiteCommercial: React.FC<SiteCommercialProps> = ({ spec }) => {
  const { fps } = useVideoConfig();

  let cursor = 0;
  const timeline = spec.beats.map((beat) => {
    const from = cursor;
    const dur = beatFrames(beat.durationSec, fps);
    cursor += dur;
    return { beat, from, dur };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: spec.brand.bg }}>
      {timeline.map(({ beat, from, dur }, i) => (
        <Sequence key={i} from={from} durationInFrames={dur} name={`${i}-${beat.kind}`}>
          <TransitionIn kind={beat.transitionIn}>
            <BeatRenderer beat={beat} spec={spec} />
          </TransitionIn>
        </Sequence>
      ))}
      {spec.audioSrc ? <Audio src={staticFile(spec.audioSrc)} volume={spec.audioVolume} /> : null}
    </AbsoluteFill>
  );
};
