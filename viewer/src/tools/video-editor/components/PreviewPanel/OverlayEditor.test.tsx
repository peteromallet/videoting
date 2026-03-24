import { existsSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineRow } from "@xzdarcy/timeline-engine";
import type { ClipMeta } from "@/tools/video-editor/lib/timeline-data";
import OverlayEditor from "./OverlayEditor";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const rows: TimelineRow[] = [
  {
    id: "V1",
    actions: [{ id: "clip-1", start: 0, end: 10, effectId: "effect-clip-1" }],
  },
];

const textMeta: ClipMeta = {
  track: "V1",
  clipType: "text",
  x: 120,
  y: 80,
  width: 480,
  height: 160,
  text: {
    content: "Hello world",
    fontFamily: "Georgia, serif",
    fontSize: 64,
    color: "#ffffff",
    align: "center",
    bold: true,
    italic: false,
  },
};

const hasDomTestDeps = [
  "@testing-library/react",
  "jsdom",
].every((pkg) => existsSync(path.resolve(process.cwd(), "node_modules", pkg)));

type TestingLibrary = {
  cleanup: () => void;
  fireEvent: {
    blur: (node: Element) => void;
    change: (node: Element, init: { target: { value: string } }) => void;
    doubleClick: (node: Element) => void;
    keyDown: (node: Element, init: { key: string }) => void;
  };
  render: (ui: ReactNode) => void;
  screen: {
    getByRole: (role: string) => HTMLElement;
    getByText: (text: string) => HTMLElement;
    queryByRole: (role: string) => HTMLElement | null;
  };
};

let testingLibrary: TestingLibrary | null = null;

const createPlayerRef = () => {
  const parent = document.createElement("div");
  const player = document.createElement("div");

  parent.appendChild(player);
  document.body.appendChild(parent);

  Object.defineProperty(player, "offsetParent", {
    configurable: true,
    get: () => parent,
  });

  player.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 640,
    height: 360,
    right: 640,
    bottom: 360,
    toJSON: () => ({}),
  });

  parent.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 640,
    height: 360,
    right: 640,
    bottom: 360,
    toJSON: () => ({}),
  });

  return {
    ref: { current: player },
    dispose: () => {
      parent.remove();
    },
  };
};

const renderEditor = () => {
  if (!testingLibrary) {
    throw new Error("DOM testing helpers are unavailable");
  }

  const player = createPlayerRef();
  const onOverlayChange = vi.fn();
  const onSelectClip = vi.fn();

  testingLibrary.render(
    <OverlayEditor
      rows={rows}
      meta={{ "clip-1": textMeta }}
      currentTime={1}
      playerContainerRef={player.ref}
      trackScaleMap={{ V1: 1 }}
      compositionWidth={1280}
      compositionHeight={720}
      selectedClipId={null}
      onSelectClip={onSelectClip}
      onOverlayChange={onOverlayChange}
    />,
  );

  const label = testingLibrary.screen.getByText("Hello world");
  const overlay = label.parentElement as HTMLElement;

  return {
    dispose: player.dispose,
    onOverlayChange,
    onSelectClip,
    overlay,
  };
};

describe("OverlayEditor", () => {
  beforeEach(async () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    if (hasDomTestDeps) {
      // @ts-expect-error Optional DOM-testing dependency is unavailable in restricted environments.
      const loaded = await import("@testing-library/react");
      testingLibrary = {
        cleanup: loaded.cleanup,
        fireEvent: loaded.fireEvent,
        render: loaded.render,
        screen: loaded.screen,
      };
    }
  });

  afterEach(() => {
    testingLibrary?.cleanup();
    testingLibrary = null;
    vi.unstubAllGlobals();
  });

  it("exports the component as default", () => {
    expect(typeof OverlayEditor).toBe("function");
  });

  const itDom = hasDomTestDeps ? it : it.skip;

  itDom("opens an inline textarea when a text overlay is double-clicked", () => {
    const { dispose, onSelectClip, overlay } = renderEditor();

    testingLibrary?.fireEvent.doubleClick(overlay);

    const textarea = testingLibrary?.screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hello world");
    expect(onSelectClip).toHaveBeenCalledWith("clip-1");

    dispose();
  });

  itDom("pushes text changes through onOverlayChange while editing", () => {
    const { dispose, onOverlayChange, overlay } = renderEditor();

    testingLibrary?.fireEvent.doubleClick(overlay);
    const textarea = testingLibrary?.screen.getByRole("textbox") as HTMLTextAreaElement;
    testingLibrary?.fireEvent.change(textarea, { target: { value: "Updated copy" } });

    expect(onOverlayChange).toHaveBeenCalledWith("clip-1", {
      text: {
        ...textMeta.text,
        content: "Updated copy",
      },
    });

    dispose();
  });

  itDom("closes the inline editor when Escape is pressed", () => {
    const { dispose, overlay } = renderEditor();

    testingLibrary?.fireEvent.doubleClick(overlay);
    const textarea = testingLibrary?.screen.getByRole("textbox") as HTMLTextAreaElement;
    testingLibrary?.fireEvent.keyDown(textarea, { key: "Escape" });

    expect(testingLibrary?.screen.queryByRole("textbox")).toBeNull();

    dispose();
  });

  itDom("closes the inline editor on blur", () => {
    const { dispose, overlay } = renderEditor();

    testingLibrary?.fireEvent.doubleClick(overlay);
    const textarea = testingLibrary?.screen.getByRole("textbox") as HTMLTextAreaElement;
    testingLibrary?.fireEvent.blur(textarea);

    expect(testingLibrary?.screen.queryByRole("textbox")).toBeNull();

    dispose();
  });
});
