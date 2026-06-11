import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { SiteCommercial, type SiteCommercialProps } from "./SiteCommercial";
import { SiteCommercial3D, type SiteCommercial3DProps } from "./three/SiteCommercial3D";
import {
  FORMATS,
  commercialSpecSchema,
  specDurationInFrames,
  type CommercialSpec,
} from "./types";
import { spec3dSchema, spec3dDurationInFrames, type Spec3D } from "./types3d";

// Stub so `remotion studio` opens without a real spec; the render script
// always overrides via inputProps.
const stubSpec: CommercialSpec = commercialSpecSchema.parse({
  name: "stub",
  brand: { name: "Subsecond Studio" },
  beats: [{ kind: "text-card", durationSec: 2, headline: "Site Commercial" }],
});

const calculateMetadata: CalculateMetadataFunction<SiteCommercialProps> = ({ props }) => {
  const spec = commercialSpecSchema.parse(props.spec);
  const { width, height } = FORMATS[spec.format];
  return {
    durationInFrames: specDurationInFrames(spec),
    fps: spec.fps,
    width,
    height,
    props: { spec },
  };
};

const stub3d: Spec3D = spec3dSchema.parse({
  name: "stub3d",
  brand: { name: "Subsecond Studio" },
  journey: [
    { kind: "text-moment", durationSec: 2, headline: "Site Commercial 3D" },
    { kind: "text-moment", durationSec: 2, headline: "Stub" },
  ],
});

const calculateMetadata3d: CalculateMetadataFunction<SiteCommercial3DProps> = ({ props }) => {
  const spec = spec3dSchema.parse(props.spec);
  const { width, height } = FORMATS[spec.format];
  return {
    durationInFrames: spec3dDurationInFrames(spec),
    fps: spec.fps,
    width,
    height,
    props: { spec },
  };
};

export const SiteCommercialRoot: React.FC = () => (
  <>
    <Composition
      id="SiteCommercial"
      component={SiteCommercial}
      durationInFrames={specDurationInFrames(stubSpec)}
      fps={stubSpec.fps}
      width={FORMATS[stubSpec.format].width}
      height={FORMATS[stubSpec.format].height}
      defaultProps={{ spec: stubSpec } satisfies SiteCommercialProps}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="SiteCommercial3D"
      component={SiteCommercial3D}
      durationInFrames={spec3dDurationInFrames(stub3d)}
      fps={stub3d.fps}
      width={FORMATS[stub3d.format].width}
      height={FORMATS[stub3d.format].height}
      defaultProps={{ spec: stub3d } satisfies SiteCommercial3DProps}
      calculateMetadata={calculateMetadata3d}
    />
  </>
);
