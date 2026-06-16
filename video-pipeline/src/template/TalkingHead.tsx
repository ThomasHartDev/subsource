import React, { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type CaptionWord = { word: string; start: number; end: number };

// "vertical" = 9:16 (TikTok/Reels/Shorts): captions sit high in the Hormozi zone
// to clear the bottom UI. "landscape" = 16:9 (YouTube/LinkedIn/X): captions sit
// in the lower third with more horizontal room. The music bed is baked into the
// video's audio track upstream (ffmpeg sidechain duck), so there's no Remotion
// Audio track here — both orientations carry the same mixed audio.
export type Orientation = "vertical" | "landscape";

export type TalkingHeadProps = {
  videoSrc: string; // staticFile-relative path to the trimmed video
  captions: CaptionWord[]; // timestamps in the trimmed timeline (seconds)
  accent: string; // active-word highlight color
  maxWordsPerGroup: number;
  orientation?: Orientation;
};

// Per-orientation caption layout. Font is a fraction of frame height so it reads
// the same physical size in both, padding keeps it inside each platform's safe
// zone (vertical bottom UI is taller than landscape's). paddingXFrac is the
// number behind paddingX, used to compute the available width for font auto-fit.
const LAYOUT: Record<Orientation, { fontFrac: number; paddingBottom: string; paddingXFrac: number }> = {
  vertical: { fontFrac: 0.05, paddingBottom: "33%", paddingXFrac: 0.09 },
  landscape: { fontFrac: 0.058, paddingBottom: "10%", paddingXFrac: 0.12 },
};

// Rough advance width of Arial Black caps as a fraction of font size. Used to
// shrink a group's font when a single long word ("STATISTICALLY,") would
// otherwise overflow the safe width and clip against the frame edge.
const CHAR_ADVANCE = 0.62;

type Group = { words: CaptionWord[]; start: number; end: number };

// Chunk caption words into short on-screen groups. Break on a big gap or when
// the group hits the word cap, so no more than a few words are ever on screen.
function groupCaptions(captions: CaptionWord[], maxWords: number): Group[] {
  const groups: Group[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (cur.length) {
      groups.push({ words: cur, start: cur[0]!.start, end: cur[cur.length - 1]!.end });
      cur = [];
    }
  };
  for (let i = 0; i < captions.length; i++) {
    const w = captions[i]!;
    const prev = cur[cur.length - 1];
    if (cur.length >= maxWords || (prev && w.start - prev.end > 0.7)) flush();
    cur.push(w);
  }
  flush();
  return groups;
}

export const TalkingHead: React.FC<TalkingHeadProps> = ({
  videoSrc,
  captions,
  accent,
  maxWordsPerGroup,
  orientation = "vertical",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const layout = LAYOUT[orientation];

  const groups = useMemo(() => groupCaptions(captions, maxWordsPerGroup), [captions, maxWordsPerGroup]);

  // Show the latest group whose start has passed, so text stays on screen
  // continuously through the gaps between groups (no flicker).
  let active: Group | null = null;
  for (const g of groups) {
    if (g.start <= t + 0.05) active = g;
    else break;
  }

  const baseFontPx = Math.round(height * layout.fontFrac);
  const safeWidth = width * (1 - 2 * layout.paddingXFrac);

  // Auto-fit: if the longest word in the group would overflow the safe width at
  // the base size, shrink the whole group's font so it fits (down to a floor).
  let fontPx = baseFontPx;
  if (active) {
    const longest = Math.max(...active.words.map((w) => w.word.length));
    const fit = safeWidth / (longest * CHAR_ADVANCE);
    fontPx = Math.round(Math.max(baseFontPx * 0.6, Math.min(baseFontPx, fit)));
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo src={staticFile(videoSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />

      {active ? <CaptionGroup group={active} t={t} fontPx={fontPx} accent={accent} layout={layout} /> : null}
    </AbsoluteFill>
  );
};

const CaptionGroup: React.FC<{
  group: Group;
  t: number;
  fontPx: number;
  accent: string;
  layout: { paddingBottom: string; paddingXFrac: number };
}> = ({ group, t, fontPx, accent, layout }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  // Pop the group in when it first appears.
  const appearFrame = Math.round(group.start * fps);
  const scale = spring({
    fps,
    frame: frame - appearFrame,
    config: { damping: 12, stiffness: 200, mass: 0.6 },
    durationInFrames: 12,
  });
  // Gentle fade/rise instead of a bouncy pop — minimal style.
  const pop = interpolate(scale, [0, 1], [0.96, 1]);
  const opacity = interpolate(scale, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        // Caption band is orientation-driven: vertical sits in the Hormozi zone
        // (clears top username/ads + bottom comment/share UI), landscape sits in
        // the lower third with wider margins.
        paddingBottom: layout.paddingBottom,
        paddingLeft: `${layout.paddingXFrac * 100}%`,
        paddingRight: `${layout.paddingXFrac * 100}%`,
      }}
    >
      <div
        style={{
          transform: `scale(${pop})`,
          opacity,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `0 ${fontPx * 0.26}px`,
          // Clean medium-weight sans, natural case, no all-caps. The "loud"
          // look came from Arial Black 900 + caps + thick stroke + yellow; this
          // keeps captions legible but understated.
          fontFamily: '"Helvetica Neue", Inter, system-ui, Arial, sans-serif',
          fontWeight: 600,
          fontSize: fontPx,
          lineHeight: 1.12,
          letterSpacing: "-0.01em",
          textAlign: "center",
        }}
      >
        {group.words.map((w, i) => {
          const isActive = t >= w.start - 0.02 && t <= w.end + 0.08;
          return (
            <span
              key={i}
              style={{
                // Emphasis is opacity, not color: the current word is full
                // white, the rest dimmed. accent tints the active word only if
                // the caller passes a real color (default white = monochrome).
                color: isActive ? accent : "rgba(255,255,255,0.9)",
                opacity: isActive ? 1 : 0.55,
                // Thin stroke + soft shadow for legibility on bright footage,
                // far lighter than the old heavy outline.
                WebkitTextStroke: `${Math.max(1, fontPx * 0.018)}px rgba(0,0,0,0.55)`,
                paintOrder: "stroke fill",
                textShadow: "0 2px 10px rgba(0,0,0,0.45)",
                transition: "opacity 0.06s",
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
