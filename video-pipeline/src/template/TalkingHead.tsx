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
// zone (vertical bottom UI is taller than landscape's).
const LAYOUT: Record<Orientation, { fontFrac: number; paddingBottom: string; paddingX: string }> = {
  vertical: { fontFrac: 0.072, paddingBottom: "33%", paddingX: "9%" },
  landscape: { fontFrac: 0.085, paddingBottom: "10%", paddingX: "12%" },
};

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
  const { fps, height } = useVideoConfig();
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

  const fontPx = Math.round(height * layout.fontFrac);

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
  layout: { paddingBottom: string; paddingX: string };
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
  const pop = interpolate(scale, [0, 1], [0.82, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        // Caption band is orientation-driven: vertical sits in the Hormozi zone
        // (clears top username/ads + bottom comment/share UI), landscape sits in
        // the lower third with wider margins.
        paddingBottom: layout.paddingBottom,
        paddingLeft: layout.paddingX,
        paddingRight: layout.paddingX,
      }}
    >
      <div
        style={{
          transform: `scale(${pop})`,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: `0 ${fontPx * 0.28}px`,
          fontFamily: '"Arial Black", system-ui, sans-serif',
          fontWeight: 900,
          fontSize: fontPx,
          lineHeight: 1.08,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {group.words.map((w, i) => {
          const isActive = t >= w.start - 0.02 && t <= w.end + 0.08;
          return (
            <span
              key={i}
              style={{
                color: isActive ? accent : "#ffffff",
                WebkitTextStroke: `${Math.max(2, fontPx * 0.06)}px #000`,
                paintOrder: "stroke fill",
                textShadow: "0 4px 18px rgba(0,0,0,0.65)",
                transform: isActive ? "translateY(-2%)" : "none",
                transition: "color 0.05s",
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
