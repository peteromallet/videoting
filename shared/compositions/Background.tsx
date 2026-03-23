import type { FC } from "react";
import { AbsoluteFill, Img } from "remotion";
import type { ResolvedTimelineConfig } from "@shared/types";

export const Background: FC<{ config: ResolvedTimelineConfig }> = ({ config }) => {
  const backgroundAsset = config.output.background
    ? config.registry[config.output.background]
    : null;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {backgroundAsset ? (
        <Img
          src={backgroundAsset.src}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
