import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useCurrentFrame: vi.fn(),
  useVideoConfig: vi.fn(),
  visualizeAudio: vi.fn(),
  useAudioDataContext: vi.fn(),
  useClipStartFrame: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: <T,>(factory: () => T): T => factory(),
  };
});

vi.mock("remotion", () => ({
  useCurrentFrame: mocks.useCurrentFrame,
  useVideoConfig: mocks.useVideoConfig,
}));

vi.mock("@remotion/media-utils", () => ({
  visualizeAudio: mocks.visualizeAudio,
}));

vi.mock("../compositions/AudioDataProvider", () => ({
  useAudioDataContext: mocks.useAudioDataContext,
}));

vi.mock("../compositions/GlobalFrameContext", () => ({
  useClipStartFrame: mocks.useClipStartFrame,
}));

import { useAudioReactivity } from "./useAudioReactivity";

const makeAudioData = (durationInSeconds = 10) => ({
  durationInSeconds,
}) as any;

const makeContext = (
  clips: Array<{
    id: string;
    trackId: string;
    clipAt: number;
    clipFrom?: number;
    speed?: number;
    audioData?: any;
  }>,
) => ({
  clipEntries: new Map(
    clips.map((clip) => [
      clip.id,
      {
        audioData: clip.audioData ?? makeAudioData(),
        clipAt: clip.clipAt,
        clipFrom: clip.clipFrom ?? 0,
        speed: clip.speed ?? 1,
        volume: 1,
        trackId: clip.trackId,
      },
    ]),
  ),
  trackClipIds: clips.reduce((map, clip) => {
    const clipIds = map.get(clip.trackId) ?? [];
    clipIds.push(clip.id);
    map.set(clip.trackId, clipIds);
    return map;
  }, new Map<string, string[]>()),
});

describe("useAudioReactivity", () => {
  beforeEach(() => {
    mocks.useCurrentFrame.mockReset();
    mocks.useVideoConfig.mockReset();
    mocks.visualizeAudio.mockReset();
    mocks.useAudioDataContext.mockReset();
    mocks.useClipStartFrame.mockReset();

    mocks.useCurrentFrame.mockReturnValue(0);
    mocks.useVideoConfig.mockReturnValue({ fps: 30 });
    mocks.useClipStartFrame.mockReturnValue(0);
    mocks.useAudioDataContext.mockReturnValue({
      clipEntries: new Map(),
      trackClipIds: new Map(),
    });
  });

  it("uses the clip start offset when computing the analyzed frame", () => {
    mocks.useCurrentFrame.mockReturnValue(12);
    mocks.useClipStartFrame.mockReturnValue(30);
    mocks.useAudioDataContext.mockReturnValue(
      makeContext([{ id: "clip-1", trackId: "A1", clipAt: 1, audioData: makeAudioData(8) }]),
    );
    mocks.visualizeAudio.mockReturnValue([0.2, 0.4, 0.6]);

    const result = useAudioReactivity();

    expect(mocks.visualizeAudio).toHaveBeenCalledWith({
      audioData: makeAudioData(8),
      fps: 30,
      frame: 12,
      numberOfSamples: 32,
      smoothing: true,
    });
    expect(result.frequencyBins).toEqual([0.2, 0.4, 0.6]);
    expect(result.amplitude).toBeCloseTo(0.4);
    expect(result.bass).toBeCloseTo(0.2);
    expect(result.mid).toBeCloseTo(0.4);
    expect(result.treble).toBeCloseTo(0.6);
  });

  it("accounts for clip from and speed when mapping to source frames", () => {
    const audioData = makeAudioData(12);
    mocks.useCurrentFrame.mockReturnValue(10);
    mocks.useClipStartFrame.mockReturnValue(20);
    mocks.useAudioDataContext.mockReturnValue(
      makeContext([{ id: "clip-1", trackId: "A1", clipAt: 0.5, clipFrom: 1.5, speed: 2, audioData }]),
    );
    mocks.visualizeAudio.mockReturnValue(new Array(32).fill(0.5));

    useAudioReactivity();

    expect(mocks.visualizeAudio).toHaveBeenCalledWith({
      audioData,
      fps: 30,
      frame: 75,
      numberOfSamples: 32,
      smoothing: true,
    });
  });

  it("returns zeros when no audio clip is available", () => {
    const result = useAudioReactivity({ numberOfSamples: 4 });

    expect(result).toEqual({
      amplitude: 0,
      frequencyBins: [0, 0, 0, 0],
      bass: 0,
      mid: 0,
      treble: 0,
    });
    expect(mocks.visualizeAudio).not.toHaveBeenCalled();
  });

  it("filters to the requested audio track", () => {
    const a1Audio = makeAudioData(10);
    const a2Audio = makeAudioData(11);
    mocks.useAudioDataContext.mockReturnValue(
      makeContext([
        { id: "clip-a1", trackId: "A1", clipAt: 0, audioData: a1Audio },
        { id: "clip-a2", trackId: "A2", clipAt: 0, audioData: a2Audio },
      ]),
    );
    mocks.visualizeAudio.mockReturnValue([0.1, 0.2, 0.3]);

    useAudioReactivity({ audioTrack: "A2", numberOfSamples: 3 });

    expect(mocks.visualizeAudio).toHaveBeenCalledWith({
      audioData: a2Audio,
      fps: 30,
      frame: 0,
      numberOfSamples: 3,
      smoothing: true,
    });
  });
});
