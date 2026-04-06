import { visualizeAudio } from "@remotion/media-utils";
import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { secondsToFrames } from "../config-utils";
import { useAudioDataContext } from "../compositions/AudioDataProvider";
import { useClipStartFrame } from "../compositions/GlobalFrameContext";

type AudioReactivityOptions = {
  audioTrack?: string;
  numberOfSamples?: number;
  smoothing?: boolean;
};

type AudioReactivityResult = {
  amplitude: number;
  frequencyBins: number[];
  bass: number;
  mid: number;
  treble: number;
};

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const createZeroResult = (numberOfSamples: number): AudioReactivityResult => {
  return {
    amplitude: 0,
    frequencyBins: new Array(numberOfSamples).fill(0),
    bass: 0,
    mid: 0,
    treble: 0,
  };
};

/**
 * Returns reactive audio analysis for the currently active audio clip.
 * Amplitude reflects the raw source audio, not the final volume-adjusted mix.
 */
export const useAudioReactivity = ({
  audioTrack,
  numberOfSamples = 32,
  smoothing = true,
}: AudioReactivityOptions = {}): AudioReactivityResult => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clipStartFrame = useClipStartFrame();
  const { clipEntries, trackClipIds } = useAudioDataContext();

  return useMemo(() => {
    const zeroResult = createZeroResult(numberOfSamples);
    const globalFrame = frame + clipStartFrame;
    const targetTrackId = audioTrack ?? trackClipIds.keys().next().value;
    if (!targetTrackId) {
      return zeroResult;
    }

    const clipIds = trackClipIds.get(targetTrackId) ?? [];
    const activeClipEntry = clipIds
      .map((clipId) => clipEntries.get(clipId) ?? null)
      .find((entry) => {
        if (!entry?.audioData) {
          return false;
        }

        const clipAtFrames = secondsToFrames(entry.clipAt, fps);
        const remainingDuration = Math.max(0, entry.audioData.durationInSeconds - entry.clipFrom);
        const clipDurationInFrames = secondsToFrames(remainingDuration / entry.speed, fps);
        return globalFrame >= clipAtFrames && globalFrame < clipAtFrames + clipDurationInFrames;
      });

    if (!activeClipEntry?.audioData) {
      return zeroResult;
    }

    const clipAtFrames = secondsToFrames(activeClipEntry.clipAt, fps);
    const sourceFrame = Math.max(
      0,
      (globalFrame - clipAtFrames) * activeClipEntry.speed
      + secondsToFrames(activeClipEntry.clipFrom, fps),
    );
    const frequencyBins = visualizeAudio({
      audioData: activeClipEntry.audioData,
      fps,
      frame: sourceFrame,
      numberOfSamples,
      smoothing,
    });

    const thirdSize = Math.max(1, Math.floor(frequencyBins.length / 3));
    const bass = average(frequencyBins.slice(0, thirdSize));
    const mid = average(frequencyBins.slice(thirdSize, thirdSize * 2));
    const treble = average(frequencyBins.slice(thirdSize * 2));

    return {
      amplitude: average(frequencyBins),
      frequencyBins,
      bass,
      mid,
      treble,
    };
  }, [audioTrack, clipEntries, clipStartFrame, fps, frame, numberOfSamples, smoothing, trackClipIds]);
};
