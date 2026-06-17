import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { SECTIONS, WORDS, DURATION_IN_FRAMES, FPS as DATA_FPS, type RLSection } from "./rate-limiting-data";

// ----------------------------------------------------------------------------
// Rate Limiting — flat-illustration cut.
// The Higgsfield clips (one consistent illustrated world, character-locked) are
// the full-frame background. Remotion's job: crisp text the generative models
// garble (429, Retry-After, token counts) + cross-dissolves + karaoke lyrics,
// all in the same flat teal-and-gold palette so every cut stays in one world.
// ----------------------------------------------------------------------------

const C = {
  gold: "#E8A93C",
  goldDeep: "#C8842A",
  ink: "#143038",
  cream: "#FFF7E6",
  green: "#43B25B",
  red: "#E5484D",
  teal: "#27b6cf",
} as const;

const SANS = "Poppins, Inter, system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";

const SAFE_TOP = 150;
const SAFE_BOTTOM = 320;
const FADE = 12; // cross-dissolve frames between sections

export type RateLimitingProps = {
  audioSrc: string;
  readyClips: string[]; // section names that have a public/scenes/<name>.mp4; others fall back to the still
  readyMorphs: string[]; // "from" section names that have a public/transitions/<from>.mp4 boundary morph
};

const MORPH_WIN = 80; // frames the boundary morph occupies (covers the cut)
const MORPH_CLIP_SEC = 5;

// --- karaoke lines, grouped once from the flat word list -------------------
type RLWord = { word: string; start: number; end: number };
type Line = { words: RLWord[]; start: number; end: number };
const LINES: Line[] = (() => {
  const out: Line[] = [];
  let cur: RLWord[] = [];
  for (let i = 0; i < WORDS.length; i++) {
    const w = WORDS[i]!;
    const prev = WORDS[i - 1];
    const gap = prev ? w.start - prev.end : 0;
    if (cur.length > 0 && (gap > 0.7 || cur.length >= 7)) {
      out.push({ words: cur, start: cur[0]!.start, end: cur[cur.length - 1]!.end });
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push({ words: cur, start: cur[0]!.start, end: cur[cur.length - 1]!.end });
  return out;
})();

// =============================================================================
// Background: each section's clip/still, cross-dissolved
// =============================================================================

const SceneBg: React.FC<{ section: RLSection; hasClip: boolean }> = ({ section, hasClip }) => {
  const frame = useCurrentFrame();
  const len = section.durationInFrames + 2 * FADE;
  const opacity = interpolate(frame, [0, FADE, len - FADE, len], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const windowSec = len / DATA_FPS;
  const rate = Math.min(1.6, Math.max(0.45, 8 / windowSec));
  return (
    <AbsoluteFill style={{ opacity, backgroundColor: C.teal }}>
      {hasClip ? (
        <OffthreadVideo
          src={staticFile(`scenes/${section.name}.mp4`)}
          muted
          playbackRate={rate}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Img src={staticFile(`keyframes/${section.name}.png`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </AbsoluteFill>
  );
};

const Background: React.FC<{ readyClips: string[] }> = ({ readyClips }) => (
  <AbsoluteFill style={{ backgroundColor: C.teal }}>
    {SECTIONS.map((s) => (
      <Sequence key={s.name} from={Math.max(0, s.from - FADE)} durationInFrames={s.durationInFrames + 2 * FADE} name={`bg-${s.name}`}>
        <SceneBg section={s} hasClip={readyClips.includes(s.name)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

// =============================================================================
// Boundary morphs — Kling 3.0 interpolations that transform scene A into scene
// B. Placed ending exactly on the next section's start so the morph's last
// frame (B's keyframe) meets B's clip cleanly. Covers the cut underneath.
// =============================================================================

const MorphClip: React.FC<{ from: string }> = ({ from }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6, MORPH_WIN - 6, MORPH_WIN], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rate = (MORPH_CLIP_SEC * DATA_FPS) / MORPH_WIN; // fit the 5s morph into the window
  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo src={staticFile(`transitions/${from}.mp4`)} muted playbackRate={rate} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
};

const MorphTransitions: React.FC<{ readyMorphs: string[] }> = ({ readyMorphs }) => (
  <AbsoluteFill>
    {SECTIONS.slice(0, -1).map((s, i) => {
      const next = SECTIONS[i + 1]!;
      if (!readyMorphs.includes(s.name)) return null;
      const from = Math.max(0, next.from - MORPH_WIN);
      return (
        <Sequence key={`morph-${s.name}`} from={from} durationInFrames={MORPH_WIN} name={`morph-${s.name}`}>
          <MorphClip from={s.name} />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);

// =============================================================================
// Flat-style overlay primitives
// =============================================================================

// Bold cartoon text: heavy weight + dark stroke + soft shadow so it reads on
// the busy illustration without a card.
const popText = (size: number, color: string, stroke = "#0c2229"): React.CSSProperties => ({
  fontFamily: SANS,
  fontWeight: 900,
  fontSize: size,
  color,
  WebkitTextStroke: `${Math.max(2, size * 0.03)}px ${stroke}`,
  letterSpacing: "-0.01em",
  lineHeight: 1.02,
  textShadow: "0 6px 18px rgba(0,0,0,0.35)",
  textAlign: "center",
});

// Rounded cream stat card for precise numbers/labels.
const Card: React.FC<{ children: React.ReactNode; accent?: string; delay?: number }> = ({ children, accent = C.gold, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <div
      style={{
        transform: `scale(${interpolate(s, [0, 1], [0.8, 1])})`,
        opacity: s,
        background: C.cream,
        border: `5px solid ${accent}`,
        borderRadius: 26,
        padding: "20px 30px",
        boxShadow: "0 12px 36px rgba(0,0,0,0.28)",
        color: C.ink,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
};

const TopLabel: React.FC<{ children: React.ReactNode; color?: string }> = ({ children }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [4, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP }}>
      <div style={{ opacity: op, ...popText(40, "#ffffff"), textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 26 }}>{children}</div>
    </AbsoluteFill>
  );
};

const CenterStack: React.FC<{ children: React.ReactNode; gap?: number; top?: number }> = ({ children, gap = 28, top = 0 }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap, paddingTop: SAFE_TOP + top, paddingBottom: SAFE_BOTTOM }}>
    {children}
  </AbsoluteFill>
);

// token counter that animates down then refills, for the bucket section
function tokenCount(f: number): number {
  const drainStart = 90;
  const consumed = f > drainStart ? Math.floor((f - drainStart) / 16) : 0;
  const refill = f > drainStart ? Math.floor((f - drainStart) / 26) : 0;
  return Math.max(0, Math.min(10, 10 - consumed + refill));
}

// =============================================================================
// Per-section overlays (local frame starts at 0)
// =============================================================================

const OverlayRouter: React.FC<{ section: RLSection }> = ({ section }) => {
  const frame = useCurrentFrame();
  switch (section.name) {
    case "intro":
      return (
        <CenterStack gap={20}>
          <div style={popText(120, "#ffffff")}>RATE</div>
          <div style={popText(120, C.gold)}>LIMITING</div>
          <div style={{ ...popText(30, "#ffffff"), fontWeight: 700, marginTop: 16 }}>computer science, as a song</div>
        </CenterStack>
      );
    case "request":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP + 40 }}>
          {frame > 150 ? (
            <Card accent={C.gold}>
              <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 46 }}>
                limit: 100<span style={{ color: C.goldDeep }}> / min</span>
              </div>
            </Card>
          ) : null}
        </AbsoluteFill>
      );
    case "bucket": {
      const n = tokenCount(frame);
      return (
        <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "center", padding: 50, paddingBottom: SAFE_BOTTOM }}>
          <Card accent={C.gold}>
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 52, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: n <= 2 ? C.red : C.goldDeep }}>{n}</span>
              <span style={{ opacity: 0.5 }}> / 10</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, opacity: 0.7, marginTop: 6 }}>refill +1 / sec</div>
          </Card>
        </AbsoluteFill>
      );
    }
    case "overload":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP + 30 }}>
          <Card accent={C.red}>
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 52, color: C.red, fontVariantNumeric: "tabular-nums" }}>101 / 100</div>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, marginTop: 6 }}>OVER THE LIMIT</div>
          </Card>
        </AbsoluteFill>
      );
    case "rejected":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", flexDirection: "column", gap: 14, paddingTop: SAFE_TOP - 30 }}>
          <div style={popText(150, C.red)}>429</div>
          <div style={{ ...popText(38, "#ffffff"), fontWeight: 800 }}>Too Many Requests</div>
          {frame > 50 ? (
            <Card accent={C.gold} delay={50}>
              <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 34 }}>Retry-After: 30s</div>
            </Card>
          ) : null}
        </AbsoluteFill>
      );
    case "why":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP + 30 }}>
          <div style={popText(54, "#ffffff")}>
            a limit keeps
            <br />
            <span style={{ color: C.green }}>it alive</span>
          </div>
        </AbsoluteFill>
      );
    case "break":
      return null; // let the server room breathe
    case "youAreServer":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP + 20 }}>
          <Card accent={C.gold}>
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 38 }}>your energy</div>
            <div style={{ fontFamily: MONO, fontSize: 24, opacity: 0.7, marginTop: 6 }}>sleep = refill</div>
          </Card>
        </AbsoluteFill>
      );
    case "burnout":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP + 20 }}>
          <Card accent={C.red}>
            <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 40, color: C.red }}>503</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, marginTop: 4 }}>service unavailable</div>
          </Card>
        </AbsoluteFill>
      );
    case "chorus":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP }}>
          <div style={popText(64, "#ffffff")}>
            a limit keeps
            <br />
            <span style={{ color: C.gold }}>it alive</span>
          </div>
        </AbsoluteFill>
      );
    case "outro":
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: SAFE_TOP + 10 }}>
          <div style={popText(46, "#ffffff")}>set your limit</div>
        </AbsoluteFill>
      );
    case "tail":
      return (
        <CenterStack gap={16}>
          <div style={popText(90, "#ffffff")}>RATE LIMITING</div>
          <div style={{ ...popText(30, C.gold), fontWeight: 800 }}>token bucket · 429 · Retry-After</div>
          <div style={{ ...popText(26, "#ffffff"), fontWeight: 700, marginTop: 20 }}>CS, in songs</div>
        </CenterStack>
      );
    default:
      return null;
  }
};

const Overlays: React.FC = () => (
  <AbsoluteFill>
    {SECTIONS.map((s) => (
      <Sequence key={s.name} from={s.from} durationInFrames={s.durationInFrames} name={`fx-${s.name}`}>
        <OverlayRouter section={s} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

// =============================================================================
// Karaoke lyrics, restyled for the flat world
// =============================================================================

const Lyrics: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;
  const line = useMemo(() => LINES.find((l) => sec >= l.start - 0.15 && sec <= l.end + 0.4), [sec]);
  if (!line) return null;
  const appear = interpolate(sec, [line.start - 0.15, line.start + 0.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: SAFE_BOTTOM - 50 }}>
      <div
        style={{
          maxWidth: 940,
          textAlign: "center",
          background: C.cream,
          border: `4px solid ${C.ink}`,
          borderRadius: 20,
          padding: "16px 28px",
          opacity: appear,
          boxShadow: "0 8px 28px rgba(0,0,0,0.3)",
        }}
      >
        {line.words.map((w, i) => {
          const active = sec >= w.start - 0.05 && sec < w.end + 0.12;
          return (
            <span
              key={i}
              style={{
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 44,
                color: active ? C.goldDeep : C.ink,
                margin: "0 5px",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================

export const RateLimiting: React.FC<RateLimitingProps> = ({ audioSrc, readyClips, readyMorphs }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.teal }}>
      <Audio src={staticFile(audioSrc)} />
      <Background readyClips={readyClips} />
      <MorphTransitions readyMorphs={readyMorphs} />
      <Overlays />
      <Lyrics />
    </AbsoluteFill>
  );
};

export const RATE_LIMITING_DURATION = DURATION_IN_FRAMES;
