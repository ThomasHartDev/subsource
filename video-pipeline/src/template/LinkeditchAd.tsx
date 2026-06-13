import {
  AbsoluteFill,
  Audio,
  Freeze,
  OffthreadVideo,
  Sequence,
  Series,
  staticFile,
  type CalculateMetadataFunction,
} from "remotion";
import React from "react";

export type LinkeditchAdProps = {
  /** Paths relative to the public dir, e.g. "clips/shot-0.mp4" */
  clip1Path: string;
  clip2Path: string;
  clip3Path: string;
  /** e.g. "audio/vo.mp3" */
  voPath: string;
  /** Frame counts computed by the render script via parseMedia. */
  clip1Frames: number;
  clip2Frames: number;
  clip3Frames: number;
  /** Hold duration for the last-frame freeze (1.5s @ 30fps = 45). */
  freezeFrames: number;
};

// Frame counts are supplied via inputProps from the render script, so
// durationInFrames is derived from props — no file I/O needed here.
export const calculateMetadata: CalculateMetadataFunction<LinkeditchAdProps> = ({
  props,
}) => ({
  durationInFrames:
    props.clip1Frames +
    props.clip2Frames +
    props.clip3Frames +
    props.freezeFrames,
});

const videoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

// Shows clip3 for its natural duration, then overlays a frozen last frame.
const Clip3WithFreeze: React.FC<{
  src: string;
  videoFrames: number;
  freezeFrames: number;
}> = ({ src, videoFrames, freezeFrames }) => (
  <AbsoluteFill>
    <Sequence durationInFrames={videoFrames}>
      <OffthreadVideo src={staticFile(src)} muted style={videoStyle} />
    </Sequence>
    <Sequence from={videoFrames} durationInFrames={freezeFrames}>
      <Freeze frame={videoFrames - 1}>
        <OffthreadVideo src={staticFile(src)} muted style={videoStyle} />
      </Freeze>
    </Sequence>
  </AbsoluteFill>
);

export const LinkeditchAd: React.FC<LinkeditchAdProps> = ({
  clip1Path,
  clip2Path,
  clip3Path,
  voPath,
  clip1Frames,
  clip2Frames,
  clip3Frames,
  freezeFrames,
}) => {
  // VO must be a sibling of <Series>, not inside a <Series.Sequence>.
  // Placing it inside a sequence stops the audio at the sequence boundary.
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Audio src={staticFile(voPath)} />
      <Series>
        <Series.Sequence durationInFrames={clip1Frames} premountFor={30}>
          <OffthreadVideo
            src={staticFile(clip1Path)}
            muted
            style={videoStyle}
          />
        </Series.Sequence>
        <Series.Sequence durationInFrames={clip2Frames} premountFor={30}>
          <OffthreadVideo
            src={staticFile(clip2Path)}
            muted
            style={videoStyle}
          />
        </Series.Sequence>
        <Series.Sequence
          durationInFrames={clip3Frames + freezeFrames}
          premountFor={30}
        >
          <Clip3WithFreeze
            src={clip3Path}
            videoFrames={clip3Frames}
            freezeFrames={freezeFrames}
          />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
