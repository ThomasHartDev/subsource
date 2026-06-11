import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { SiteCommercial, type SiteCommercialProps } from "./SiteCommercial";
import {
  FORMATS,
  commercialSpecSchema,
  specDurationInFrames,
  type CommercialSpec,
} from "./types";

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

export const SiteCommercialRoot: React.FC = () => (
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
);
