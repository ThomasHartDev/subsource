import React, { useMemo } from "react";
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

export type CaptionWord = { word: string; start: number; end: number };

export type TalkingHeadProps = {
  videoSrc: string; // staticFile-relative path to the trimmed video
  captions: CaptionWord[]; // timestamps in the trimmed timeline (seconds)
  music?: string; // optional staticFile-relative bed
  accent: string; // active-word highlight color
  maxWordsPerGroup: number;
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
  music,
  accent,
  maxWordsPerGroup,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;

  const groups = useMemo(() => groupCaptions(captions, maxWordsPerGroup), [captions, maxWordsPerGroup]);

  // Show the latest group whose start has passed, so text stays on screen
  // continuously through the gaps between groups (no flicker).
  let active: Group | null = null;
  for (const g of groups) {
    if (g.start <= t + 0.05) active = g;
    else break;
  }

  const fontPx = Math.round(height * 0.072); // ~7% of frame height

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo src={staticFile(videoSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />

      {active ? <CaptionGroup group={active} t={t} fontPx={fontPx} accent={accent} /> : null}

      {music ? (
        <Sequence from={0}>
          <Audio src={staticFile(music)} volume={0.12} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const CaptionGroup: React.FC<{ group: Group; t: number; fontPx: number; accent: string }> = ({
  group,
  t,
  fontPx,
  accent,
}) => {
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
        // Sit captions ~62% down (Hormozi zone): clears the username/ads up top
        // and the comment/share/caption UI in the bottom ~25%.
        paddingBottom: "33%",
        paddingLeft: "9%",
        paddingRight: "9%",
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
