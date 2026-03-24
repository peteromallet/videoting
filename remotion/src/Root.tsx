import type { FC } from "react";
import { Composition } from "remotion";
import { getTimelineDurationInFrames, parseResolution } from "../../shared/config-utils";
import type { TimelineCompositionProps } from "../../shared/types";
import { CompositionVideo } from "./CompositionVideo";
import { loadTimelineConfig } from "./load-config";
import { Timeline } from "./timeline/Timeline";

const PREVIEW_SCALE = 0.5;

export const RemotionRoot: FC = () => {
  return (
    <>
      <Composition
        id="CompositionVideo"
        component={CompositionVideo}
        durationInFrames={191}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Timeline"
        component={Timeline}
        defaultProps={{ preview: false }}
        width={1280}
        height={720}
        fps={30}
        durationInFrames={1}
        calculateMetadata={async ({ props }) => {
          const config = await loadTimelineConfig();
          const fps = config.output.fps;
          const { width, height } = parseResolution(config.output.resolution);
          const scale = props.preview ? PREVIEW_SCALE : 1;

          return {
            fps,
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
            durationInFrames: getTimelineDurationInFrames(config, fps),
            props: {
              ...props,
              config,
            },
          };
        }}
      />
    </>
  );
};
