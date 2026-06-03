import { Composition } from "remotion";
import { AppPitchAd, type AppPitchAdProps } from "./AppPitchAd";
import { VeoAd, type VeoAdProps } from "./VeoAd";
import { GlassCards, type GlassCardsProps, SHOTS_FRAMES } from "./GlassCards";
import { TalkingHead, type TalkingHeadProps } from "./TalkingHead";
import { RateLimiting, RATE_LIMITING_DURATION, type RateLimitingProps } from "./RateLimiting";
import { getPlatformSpec } from "../types";

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

// Stub scenes so Remotion preview can load before a real render generates them.
const stubScenes: AppPitchAdProps["scenes"] = Array.from({ length: 6 }, (_, i) => ({
  kind: i === 0 ? "hook" : i === 5 ? "cta" : i === 1 ? "problem" : i === 2 ? "solution" : "feature",
  headline: i === 0 ? "Your hook headline" : `Scene ${i + 1}`,
  subline: i === 5 ? "Get Early Access" : "Supporting line",
  voiceover: "placeholder voiceover",
  durationSec: 4,
  audioSrc: "audio/placeholder.mp3",
  durationFrames: 4 * FPS,
  startFrame: i * 4 * FPS,
}));

const placeholder: AppPitchAdProps = {
  fps: FPS,
  script: {
    appName: "Receipt Wrangler",
    tagline: "Receipts, sorted.",
    voiceStyle: "confident-warm",
    scenes: stubScenes.map((s) => ({
      kind: s.kind,
      headline: s.headline,
      subline: s.subline,
      voiceover: s.voiceover,
      durationSec: s.durationSec,
    })),
  },
  scenes: stubScenes,
  platformSpec: getPlatformSpec("tiktok-feed"),
};

// Stub VeoAd defaults so the Remotion preview can load before a real render
// produces the Veo clips on disk. The render script overrides everything via
// inputProps at renderMedia time.
const veoStub: VeoAdProps = {
  shots: [
    {
      clipPath: "shot-0.mp4",
      audioPath: null,
      durationSec: 8,
      onScreenText: null,
    },
  ],
  endCardText: "Get Early Access",
  appName: "Linkeditch",
  platformSpec: getPlatformSpec("tiktok-feed"),
  fps: FPS,
};
const veoStubFrames = Math.max(
  1,
  veoStub.shots.reduce((a, s) => a + Math.round(s.durationSec * FPS), 0),
);

const GLASS_FPS = 30;

const glassDefaults: GlassCardsProps = {
  effects: "full",
  music: "music.mp3",
  cards: [
    {
      src: "textures/forbidden-m.png",
      texW: 645,
      texH: 1398,
      position: [0.3, 0, 0.5],
      rotationY: -0.1,
      accent: "#f5b50a",
      scrollPhase: 0,
    },
    {
      src: "textures/portfolio-m.png",
      texW: 645,
      texH: 1398,
      position: [-1.0, 2.7, -0.6],
      rotationY: 0.22,
      accent: "#7c8bff",
      scrollPhase: 0.33,
    },
    {
      src: "textures/honey-m.png",
      texW: 645,
      texH: 1398,
      position: [-0.7, -2.7, -0.5],
      rotationY: 0.18,
      accent: "#f59e0b",
      scrollPhase: 0.66,
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AppPitchAd"
        component={AppPitchAd}
        // Width/height/fps/durationInFrames are placeholders. They're overridden
        // at renderMedia call time via the per-platform composition override.
        durationInFrames={Math.max(1, placeholder.scenes.reduce((a, s) => a + s.durationFrames, 0)) || 30}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={placeholder}
      />
      <Composition
        id="VeoAd"
        component={VeoAd}
        durationInFrames={veoStubFrames}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={veoStub}
      />
      <Composition
        id="GlassCards"
        component={GlassCards}
        durationInFrames={SHOTS_FRAMES}
        fps={GLASS_FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={glassDefaults}
      />
      <Composition
        id="RateLimiting"
        component={RateLimiting}
        durationInFrames={RATE_LIMITING_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={
          {
            audioSrc: "rate-limiting.mp3",
            readyClips: [],
            readyMorphs: [],
          } satisfies RateLimitingProps
        }
      />
      <Composition
        id="TalkingHead"
        component={TalkingHead}
        // Dimensions + duration are overridden per-render via inputProps; these
        // are placeholders so the studio preview can mount.
        durationInFrames={300}
        fps={30}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={
          {
            videoSrc: "auto-edit/trimmed.mp4",
            captions: [
              { word: "This", start: 0, end: 0.3 },
              { word: "is", start: 0.3, end: 0.5 },
              { word: "auto", start: 0.5, end: 0.9 },
              { word: "captions", start: 0.9, end: 1.5 },
            ],
            accent: "#FFD400",
            maxWordsPerGroup: 3,
          } satisfies TalkingHeadProps
        }
      />
    </>
  );
};
