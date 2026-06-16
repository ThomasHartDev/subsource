import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
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
// produced edit. Style is modern-minimal: a solid dark card with a hairline
// border, one accent color, tabular figures, and a count-up on stats.
export type Cue = {
  start: number;
  end: number;
  kind: "stat" | "keyword" | "diagram" | "broll";
  value?: string;
  label?: string;
  text?: string;
  diagram?: { style: "steps" | "compare" | "flow"; items: string[]; title?: string };
  query?: string;
  src?: string; // staticFile-relative path to a downloaded example clip (broll)
};

export type Orientation = "vertical" | "landscape";

const ACCENT = "#33E0A1"; // modern mint — pops on video, not an indigo/purple AI tell
const CARD = "rgba(14,17,22,0.76)";
const BORDER = "1px solid rgba(255,255,255,0.14)";
const DIM = "rgba(255,255,255,0.62)";
const SHADOW = "0 14px 46px rgba(0,0,0,0.46)";

// Top band where graphics live, per orientation (keeps them off the face).
const TOP_FRAC: Record<Orientation, number> = { vertical: 0.11, landscape: 0.08 };

function useEnter(holdFrames: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ fps, frame, config: { damping: 14, stiffness: 220, mass: 0.6 }, durationInFrames: 14 });
  const exit = interpolate(frame, [holdFrames - 9, holdFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(interpolate(enter, [0, 1], [0, 1]), exit);
  const rise = interpolate(enter, [0, 1], [22, 0]);
  const scale = interpolate(enter, [0, 1], [0.9, 1]);
  return { opacity, transform: `translateY(${rise}px) scale(${scale})`, enter };
}

const FONT = '"Helvetica Neue", Inter, system-ui, Arial, sans-serif';
const cardStyle = (padV: number, padH: number, radius: number): React.CSSProperties => ({
  background: CARD,
  border: BORDER,
  borderRadius: radius,
  padding: `${padV}px ${padH}px`,
  boxShadow: SHADOW,
  fontFamily: FONT,
  color: "#fff",
  textAlign: "center",
});

// Split "3M" / "20K" / "50%" / "$1.2M" into prefix, number, decimals, suffix so
// the number can count up on entrance and stay correctly formatted.
function parseStat(value: string): { prefix: string; num: number; decimals: number; suffix: string } | null {
  const m = value.match(/^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const numStr = m[2]!;
  const dot = numStr.indexOf(".");
  return { prefix: m[1] ?? "", num: parseFloat(numStr), decimals: dot >= 0 ? numStr.length - dot - 1 : 0, suffix: m[3] ?? "" };
}

const StatCallout: React.FC<{ cue: Cue; h: number; hold: number }> = ({ cue, h, hold }) => {
  const { enter, ...anim } = useEnter(hold);
  const parsed = cue.value ? parseStat(cue.value) : null;
  const shown = parsed
    ? `${parsed.prefix}${(parsed.num * enter).toFixed(parsed.decimals)}${parsed.suffix}`
    : cue.value;
  return (
    <div style={{ ...cardStyle(h * 0.02, h * 0.03, h * 0.024), ...anim, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: h * 0.006 }}>
      <div style={{ fontSize: h * 0.082, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em", color: ACCENT, fontVariantNumeric: "tabular-nums" }}>
        {shown}
      </div>
      {cue.label ? (
        <div style={{ fontSize: h * 0.02, fontWeight: 600, color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>{cue.label}</div>
      ) : null}
    </div>
  );
};

const KeywordChip: React.FC<{ cue: Cue; h: number; hold: number }> = ({ cue, h, hold }) => {
  const { enter: _e, ...anim } = useEnter(hold);
  return (
    <div style={{ ...cardStyle(h * 0.014, h * 0.026, h * 0.5), ...anim, display: "inline-flex", alignItems: "center", gap: h * 0.012 }}>
      <span style={{ width: h * 0.012, height: h * 0.012, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />
      <span style={{ fontSize: h * 0.03, fontWeight: 700, letterSpacing: "-0.01em" }}>{cue.text}</span>
    </div>
  );
};

const DiagramOverlay: React.FC<{ cue: Cue; h: number; hold: number }> = ({ cue, h, hold }) => {
  const { enter: _e, ...anim } = useEnter(hold);
  const frame = useCurrentFrame();
  const d = cue.diagram!;
  const items = d.items.slice(0, 5);
  const fz = h * 0.024;

  const reveal = (i: number) =>
    interpolate(frame, [6 + i * 4, 14 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const chip = (txt: string, i: number, opts?: { accent?: boolean; index?: number; extra?: React.CSSProperties }) => (
    <div
      key={i}
      style={{
        opacity: reveal(i),
        transform: `translateY(${interpolate(reveal(i), [0, 1], [10, 0])}px)`,
        display: "flex",
        alignItems: "center",
        gap: h * 0.012,
        background: opts?.accent ? "rgba(51,224,161,0.14)" : "rgba(255,255,255,0.08)",
        border: opts?.accent ? `1px solid ${ACCENT}` : "1px solid rgba(255,255,255,0.12)",
        borderRadius: h * 0.014,
        padding: `${h * 0.012}px ${h * 0.02}px`,
        fontSize: fz,
        fontWeight: 600,
        ...opts?.extra,
      }}
    >
      {opts?.index != null ? (
        <span style={{ color: ACCENT, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{opts.index}</span>
      ) : null}
      <span>{txt}</span>
    </div>
  );

  let body: React.ReactNode;
  if (d.style === "flow") {
    body = (
      <div style={{ display: "flex", alignItems: "center", gap: h * 0.012, flexWrap: "wrap", justifyContent: "center" }}>
        {items.map((t, i) => (
          <React.Fragment key={i}>
            {chip(t, i)}
            {i < items.length - 1 ? <span style={{ fontSize: fz * 1.1, color: ACCENT, opacity: reveal(i) }}>→</span> : null}
          </React.Fragment>
        ))}
      </div>
    );
  } else if (d.style === "compare") {
    body = (
      <div style={{ display: "flex", alignItems: "stretch", gap: h * 0.016, justifyContent: "center" }}>
        {chip(items[0] ?? "", 0, { extra: { flex: 1, justifyContent: "center" } })}
        {chip(items[1] ?? "", 1, { accent: true, extra: { flex: 1, justifyContent: "center" } })}
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: h * 0.01, alignItems: "stretch" }}>
        {items.map((t, i) => chip(t, i, { index: i + 1, extra: { textAlign: "left" } }))}
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle(h * 0.018, h * 0.024, h * 0.02), ...anim, maxWidth: "86%" }}>
      {d.title ? (
        <div style={{ fontSize: h * 0.018, fontWeight: 700, color: ACCENT, marginBottom: h * 0.012, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {d.title}
        </div>
      ) : null}
      {body}
    </div>
  );
};

// Example footage (Pexels b-roll) shown as a rounded inset in the top region so
// the speaker stays on screen. Muted — only the speaker's audio plays.
const BrollInset: React.FC<{ cue: Cue; w: number; h: number; hold: number; orientation: Orientation }> = ({
  cue,
  w,
  h,
  hold,
  orientation,
}) => {
  const { enter: _e, ...anim } = useEnter(hold);
  if (!cue.src) return null;
  const insetW = Math.round(w * (orientation === "vertical" ? 0.58 : 0.34));
  const insetH = Math.round((insetW * 9) / 16);
  return (
    <div
      style={{
        ...anim,
        width: insetW,
        height: insetH,
        borderRadius: h * 0.02,
        overflow: "hidden",
        border: BORDER,
        boxShadow: SHADOW,
        position: "relative",
        background: "#000",
      }}
    >
      <OffthreadVideo src={staticFile(cue.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {cue.label ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            margin: h * 0.01,
            padding: `${h * 0.006}px ${h * 0.014}px`,
            background: "rgba(12,14,18,0.78)",
            borderRadius: h * 0.4,
            fontFamily: FONT,
            fontSize: h * 0.018,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          {cue.label}
        </div>
      ) : null}
    </div>
  );
};

export const OverlayLayer: React.FC<{ cues: Cue[]; orientation: Orientation }> = ({ cues, orientation }) => {
  const { fps, width, height } = useVideoConfig();
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
              {cue.kind === "broll" ? <BrollInset cue={cue} w={width} h={height} hold={hold} orientation={orientation} /> : null}
            </AbsoluteFill>
            <Audio src={staticFile(`site-commercial/sfx/${sfx}`)} volume={0.3} />
          </Sequence>
        );
      })}
    </>
  );
};
