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
import { OverlayLayer, type Cue } from "./Overlays";
import { captionFontFamily } from "./font";

export type CaptionWord = { word: string; start: number; end: number };

// CAPTION_BRAND — the one place the subtitle look is defined, so every video
// gets the identical, on-brand captions (the "repeatable, branded to me" spec).
// TikTok-creator style: bold Montserrat, no box, crisp outline so it's readable
// on ANY background, small enough to not cover the subject, with the spoken word
// popping in the brand accent.
const CAPTION_BRAND = {
  font: captionFontFamily, // Montserrat (loaded in font.ts)
  // One constant weight for every word so activating a word never changes its
  // width (no line reflow / no adjacent words merging). Emphasis is color only.
  weight: 800,
  // Outline + shadow do the legibility work instead of a background plate.
  strokeFrac: 0.07, // black outline as a fraction of font size
  wordGapFrac: 0.3, // space between words as a fraction of font size
  inactiveColor: "#ffffff",
  inactiveOpacity: 0.96,
};

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
  overlays?: Cue[]; // content-driven graphics (stat/keyword/diagram), trimmed timeline
};

// Per-orientation caption layout. Font is a fraction of frame height so it reads
// the same physical size in both, padding keeps it inside each platform's safe
// zone (vertical bottom UI is taller than landscape's). paddingXFrac is the
// number behind paddingX, used to compute the available width for font auto-fit.
const LAYOUT: Record<Orientation, { fontFrac: number; paddingBottom: string; paddingXFrac: number }> = {
  vertical: { fontFrac: 0.042, paddingBottom: "26%", paddingXFrac: 0.1 },
  landscape: { fontFrac: 0.05, paddingBottom: "8%", paddingXFrac: 0.14 },
};

// Rough advance width of Montserrat 700 as a fraction of font size. Used to
// shrink a group's font when a single long word ("STATISTICALLY,") would
// otherwise overflow the safe width and clip against the frame edge.
const CHAR_ADVANCE = 0.6;

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
  overlays = [],
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

      {overlays.length ? <OverlayLayer cues={overlays} orientation={orientation} /> : null}

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
          gap: `0 ${fontPx * CAPTION_BRAND.wordGapFrac}px`,
          // No background box — a crisp black outline + shadow keep it readable
          // on ANY background (the TikTok-creator approach). Bold Montserrat,
          // natural case, smaller so it complements the subject.
          fontFamily: CAPTION_BRAND.font,
          fontWeight: CAPTION_BRAND.weight,
          fontSize: fontPx,
          lineHeight: 1.16,
          letterSpacing: "-0.005em",
          textAlign: "center",
        }}
      >
        {group.words.map((w, i) => {
          const isActive = t >= w.start - 0.02 && t <= w.end + 0.08;
          return (
            <span
              key={i}
              style={{
                // The spoken word pops in the brand accent; the rest stay white.
                // Weight is constant so nothing reflows as words activate. Outline
                // + shadow give edge separation on any background, no box needed.
                color: isActive ? accent : CAPTION_BRAND.inactiveColor,
                opacity: isActive ? 1 : CAPTION_BRAND.inactiveOpacity,
                WebkitTextStroke: `${Math.max(2, fontPx * CAPTION_BRAND.strokeFrac)}px #000`,
                paintOrder: "stroke fill",
                textShadow: `0 ${fontPx * 0.03}px ${fontPx * 0.09}px rgba(0,0,0,0.55)`,
                transition: "color 0.06s",
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
