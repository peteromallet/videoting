import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedTimelineConfig } from "../types";

globalThis.React = React as typeof React;

const mocks = vi.hoisted(() => ({
  continueRender: vi.fn(),
  delayRender: vi.fn(),
  getAudioData: vi.fn(),
  effectCallbacks: [] as Array<() => void | (() => void)>,
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      mocks.effectCallbacks.push(effect);
    },
    useMemo: <T,>(factory: () => T): T => factory(),
    useState: <T,>(initial: T | (() => T)): [T, (value: T) => void] => {
      const value = typeof initial === "function" ? (initial as () => T)() : initial;
      const setter = vi.fn();
      mocks.stateSetters.push(setter);
      return [value, setter];
    },
  };
});

vi.mock("@remotion/media-utils", () => ({
  getAudioData: mocks.getAudioData,
}));

vi.mock("remotion", () => ({
  continueRender: mocks.continueRender,
  delayRender: mocks.delayRender,
}));

import { AudioDataProvider } from "./AudioDataProvider";

const makeConfig = (): ResolvedTimelineConfig => ({
  output: { resolution: "1280x720", fps: 30, file: "out.mp4" },
  tracks: [
    { id: "V1", kind: "visual", label: "V1" },
    { id: "A1", kind: "audio", label: "A1" },
    { id: "A2", kind: "audio", label: "A2" },
  ],
  clips: [
    {
      id: "audio-1",
      at: 0,
      track: "A1",
      from: 0.5,
      to: 4,
      asset: "asset-1",
      assetEntry: { file: "inputs/a1.mp3", src: "/inputs/a1.mp3", type: "audio/mpeg" },
    },
    {
      id: "audio-2",
      at: 2,
      track: "A2",
      from: 0,
      to: 5,
      asset: "asset-2",
      assetEntry: { file: "inputs/a2.mp3", src: "/inputs/a2.mp3", type: "audio/mpeg" },
    },
    {
      id: "visual-1",
      at: 0,
      track: "V1",
      from: 0,
      to: 5,
      asset: "asset-3",
      assetEntry: { file: "inputs/v1.mp4", src: "/inputs/v1.mp4", type: "video/mp4" },
    },
  ],
  registry: {},
});

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("AudioDataProvider", () => {
  beforeEach(() => {
    mocks.continueRender.mockReset();
    mocks.delayRender.mockReset();
    mocks.getAudioData.mockReset();
    mocks.effectCallbacks.length = 0;
    mocks.stateSetters.length = 0;
    mocks.delayRender.mockReturnValue("audio-handle");
  });

  it("renders children immediately and builds track clip ids by audio track", () => {
    const child = React.createElement("child-node");
    const element = AudioDataProvider({ config: makeConfig(), fps: 30, children: child }) as any;

    expect(element.props.children).toBe(child);
    expect(element.props.value.trackClipIds).toEqual(
      new Map([
        ["A1", ["audio-1"]],
        ["A2", ["audio-2"]],
      ]),
    );
  });

  it("keys base clip entries by clip id when the loading effect runs", () => {
    mocks.getAudioData.mockResolvedValue({ durationInSeconds: 8 });
    AudioDataProvider({ config: makeConfig(), fps: 30, children: React.createElement("child-node") });

    const cleanup = mocks.effectCallbacks[0]?.();
    const setClipEntries = mocks.stateSetters[0];
    const initialEntries = setClipEntries.mock.calls[0][0] as Map<string, any>;

    expect(initialEntries).toBeInstanceOf(Map);
    expect([...initialEntries.keys()]).toEqual(["audio-1", "audio-2"]);
    expect(initialEntries.get("audio-1")).toMatchObject({
      clipAt: 0,
      clipFrom: 0.5,
      speed: 1,
      volume: 1,
      trackId: "A1",
      audioData: null,
    });

    cleanup?.();
  });

  it("loads audio data and continues the delayed render after all loads settle", async () => {
    let resolveA1: ((value: { durationInSeconds: number }) => void) | undefined;
    let resolveA2: ((value: { durationInSeconds: number }) => void) | undefined;
    mocks.getAudioData
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveA1 = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveA2 = resolve;
      }));

    AudioDataProvider({ config: makeConfig(), fps: 30, children: React.createElement("child-node") });
    mocks.effectCallbacks[0]?.();

    expect(mocks.delayRender).toHaveBeenCalledWith("Loading audio analysis data");
    expect(mocks.continueRender).not.toHaveBeenCalled();
    expect(mocks.getAudioData).toHaveBeenCalledTimes(2);

    resolveA1?.({ durationInSeconds: 8 });
    await flushPromises();
    expect(mocks.continueRender).not.toHaveBeenCalled();

    resolveA2?.({ durationInSeconds: 9 });
    await flushPromises();

    expect(mocks.continueRender).toHaveBeenCalledWith("audio-handle");

    const setClipEntries = mocks.stateSetters[0];
    const loadedEntries = setClipEntries.mock.calls[1][0] as Map<string, any>;
    expect(loadedEntries.get("audio-1")?.audioData).toEqual({ durationInSeconds: 8 });
    expect(loadedEntries.get("audio-2")?.audioData).toEqual({ durationInSeconds: 9 });
  });
});
