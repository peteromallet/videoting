import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

globalThis.React = React as typeof React;

const { wrapWithClipEffects } = vi.hoisted(() => ({
  wrapWithClipEffects: vi.fn((content) => React.createElement("wrapped-effects", null, content)),
}));

vi.mock("remotion", () => ({
  AbsoluteFill: ({ children, style }: any) => React.createElement("div", { style }, children),
  Sequence: ({ children }: any) => React.createElement("sequence", null, children),
}));

vi.mock("../effects", () => ({
  wrapWithClipEffects,
}));

import { TextClip } from "./TextClip";

describe("TextClip", () => {
  it("routes text clips through wrapWithClipEffects", () => {
    const html = renderToStaticMarkup(
      <TextClip
        clip={{
          id: "text-1",
          at: 0,
          track: "V1",
          clipType: "text",
          text: {
            content: "Hello timeline",
            color: "#ffffff",
          },
          continuous: { type: "glitch", intensity: 0.5 },
        } as any}
        track={{ id: "V1", kind: "visual", label: "V1" } as any}
        fps={30}
      />,
    );

    expect(wrapWithClipEffects).toHaveBeenCalledTimes(1);
    expect(html).toContain("wrapped-effects");
    expect(html).toContain("Hello timeline");
  });
});
