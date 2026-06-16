import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// Content-driven graphics: number/stat callouts, keyword pops, and simple
// diagrams the dialogue-analysis step (overlays.ts) decided are worth showing.
// They sit in the TOP region so they never cover the speaker's face (captions
// own the bottom), and each enters with a whoosh/shimmer SFX so it reads as a
// produced edit.
export type Cue = {
  start: number;
  end: number;
  kind: "stat" | "keyword" | "diagram";
  value?: string;
  label?: string;
  text?: string;
  diagram?: { style: "steps" | "compare" | "flow"; items: string[]; title?: string };
};

export type Orientation = "vertical" | "landscape";

const PANEL = "rgba(12,14,18,0.62)";
const WHITE = "#ffffff";
const DIM = "rgba(255,255,255,0.66)";

// Top band where graphics live, per orientation (keeps them off the face).
const TOP_FRAC: Record<Orientation, number> = { vertical: 0.1, landscape: 0.07 };

function useEnter(holdFrames: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 16, stiffness: 180, mass: 0.7 }, durationInFrames: 12 });
  // Fade out over the last ~9 frames of the cue.
  const exit = interpolate(frame, [holdFrames - 9, holdFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(interpolate(enter, [0, 1], [0, 1]), exit);
  const rise = interpolate(enter, [0, 1], [16, 0]);
  const scale = interpolate(enter, [0, 1], [0.96, 1]);
  return { opacity, transform: `translateY(${rise}px) scale(${scale})` };
}

const panelStyle = (pad: number, radius: number): React.CSSProperties => ({
  background: PANEL,
  borderRadius: radius,
  padding: `${pad}px ${pad * 1.4}px`,
  boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
  fontFamily: '"Helvetica Neue", Inter, system-ui, Arial, sans-serif',
  color: WHITE,
  textAlign: "center",
});

const StatCallout: React.FC<{ cue: Cue; h: number; hold: number }> = ({ cue, h, hold }) => {
  const anim = useEnter(hold);
  return (
    <div style={{ ...panelStyle(h * 0.018, h * 0.02), ...anim }}>
      <div style={{ fontSize: h * 0.075, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>{cue.value}</div>
      {cue.label ? (
        <div style={{ fontSize: h * 0.022, fontWeight: 600, color: DIM, marginTop: h * 0.008, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {cue.label}
        </div>
      ) : null}
    </div>
  );
};

const KeywordChip: React.FC<{ cue: Cue; h: number; hold: number }> = ({ cue, h, hold }) => {
  const anim = useEnter(hold);
  return (
    <div style={{ ...panelStyle(h * 0.012, h * 0.5), ...anim, display: "inline-block" }}>
      <span style={{ fontSize: h * 0.032, fontWeight: 700, letterSpacing: "-0.01em" }}>{cue.text}</span>
    </div>
  );
};

const DiagramOverlay: React.FC<{ cue: Cue; h: number; hold: number }> = ({ cue, h, hold }) => {
  const anim = useEnter(hold);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = cue.diagram!;
  const items = d.items.slice(0, 5);
  const fz = h * 0.024;

  // Stagger each item in shortly after the panel appears.
  const item = (txt: string, i: number, extra?: React.CSSProperties) => {
    const reveal = interpolate(frame, [6 + i * 4, 14 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <div
        key={i}
        style={{
          opacity: reveal,
          transform: `translateY(${interpolate(reveal, [0, 1], [8, 0])}px)`,
          background: "rgba(255,255,255,0.1)",
          borderRadius: h * 0.012,
          padding: `${h * 0.01}px ${h * 0.018}px`,
          fontSize: fz,
          fontWeight: 600,
          ...extra,
        }}
      >
        {txt}
      </div>
    );
  };

  let body: React.ReactNode;
  if (d.style === "flow") {
    body = (
      <div style={{ display: "flex", alignItems: "center", gap: h * 0.012, flexWrap: "wrap", justifyContent: "center" }}>
        {items.map((t, i) => (
          <React.Fragment key={i}>
            {item(t, i)}
            {i < items.length - 1 ? <span style={{ fontSize: fz, color: DIM, opacity: interpolate(frame, [10 + i * 4, 16 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>→</span> : null}
          </React.Fragment>
        ))}
      </div>
    );
  } else if (d.style === "compare") {
    body = (
      <div style={{ display: "flex", alignItems: "stretch", gap: h * 0.014, justifyContent: "center" }}>
        {item(items[0] ?? "", 0, { flex: 1 })}
        {item(items[1] ?? "", 1, { flex: 1 })}
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: h * 0.008, alignItems: "stretch" }}>
        {items.map((t, i) => item(`${i + 1}.  ${t}`, i, { textAlign: "left" }))}
      </div>
    );
  }

  return (
    <div style={{ ...panelStyle(h * 0.016, h * 0.018), ...anim, maxWidth: "84%" }}>
      {d.title ? (
        <div style={{ fontSize: h * 0.02, fontWeight: 700, color: DIM, marginBottom: h * 0.012, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {d.title}
        </div>
      ) : null}
      {body}
    </div>
  );
};

export const OverlayLayer: React.FC<{ cues: Cue[]; orientation: Orientation }> = ({ cues, orientation }) => {
  const { fps, height } = useVideoConfig();
  return (
    <>
      {cues.map((cue, i) => {
        const from = Math.round(cue.start * fps);
        const hold = Math.max(1, Math.round((cue.end - cue.start) * fps));
        const sfx = cue.kind === "diagram" ? "shimmer.wav" : "whoosh.wav";
        return (
          <Sequence key={i} from={from} durationInFrames={hold}>
            <AbsoluteFill
              style={{
                justifyContent: "flex-start",
                alignItems: "center",
                paddingTop: `${TOP_FRAC[orientation] * 100}%`,
                paddingLeft: "6%",
                paddingRight: "6%",
              }}
            >
              {cue.kind === "stat" ? <StatCallout cue={cue} h={height} hold={hold} /> : null}
              {cue.kind === "keyword" ? <KeywordChip cue={cue} h={height} hold={hold} /> : null}
              {cue.kind === "diagram" && cue.diagram ? <DiagramOverlay cue={cue} h={height} hold={hold} /> : null}
            </AbsoluteFill>
            <Audio src={staticFile(`site-commercial/sfx/${sfx}`)} volume={0.3} />
          </Sequence>
        );
      })}
    </>
  );
};
