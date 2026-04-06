import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedTimelineConfig } from "../types";

globalThis.React = React as typeof React;

vi.mock("remotion", () => ({
  AbsoluteFill: ({ children, style, ...props }: any) => React.createElement("div", { style, ...props }, children),
}));

vi.mock("./AudioTrack", () => ({
  AudioTrack: () => React.createElement("audio-track"),
}));

vi.mock("./TextClip", () => ({
  TextClipSequence: ({ clip }: any) => React.createElement("text-clip-sequence", { "data-clip-id": clip.id }),
}));

vi.mock("./VisualClip", () => ({
  VisualClipSequence: ({ clip }: any) => React.createElement("visual-clip-sequence", { "data-clip-id": clip.id }),
}));

import { TimelineRenderer } from "./TimelineRenderer";

const makeConfig = (
  scale?: number,
  clipOverrides?: Partial<ResolvedTimelineConfig["clips"][number]>,
): ResolvedTimelineConfig => ({
  output: {
    resolution: "1280x720",
    fps: 30,
    file: "output/render.mp4",
  },
  tracks: [
    {
      id: "V1",
      kind: "visual",
      label: "V1",
      scale,
      fit: "contain",
      opacity: 1,
      blendMode: "normal",
    },
  ],
  clips: [
    {
      id: "clip-1",
      at: 0,
      track: "V1",
      clipType: "media",
      from: 0,
      to: 1,
      asset: "asset-1",
      assetEntry: {
        file: "inputs/example-image1.jpg",
        src: "/inputs/example-image1.jpg",
        type: "image/jpeg",
      },
      ...clipOverrides,
    },
  ],
  registry: {
    "asset-1": {
      file: "inputs/example-image1.jpg",
      src: "/inputs/example-image1.jpg",
      type: "image/jpeg",
    },
  },
});

describe("TimelineRenderer", () => {
  it("omits the scale wrapper transform for default scale tracks", () => {
    const html = renderToStaticMarkup(<TimelineRenderer config={makeConfig(1)} />);
    expect(html).not.toContain("transform:scale(1)");
  });

  it("keeps the scale wrapper transform for explicitly scaled tracks", () => {
    const html = renderToStaticMarkup(<TimelineRenderer config={makeConfig(1.2)} />);
    expect(html).toContain("transform:scale(1.2)");
    expect(html).toContain("transform-origin:center center");
  });

  it("bypasses the scale wrapper when a clip has explicit position overrides", () => {
    const html = renderToStaticMarkup(
      <TimelineRenderer config={makeConfig(1.2, { x: 20, y: 10, width: 400, height: 300 })} />,
    );
    expect(html).not.toContain("transform:scale(1.2)");
  });
});
