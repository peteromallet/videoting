import { getAudioData, type AudioData } from "@remotion/media-utils";
import { createContext, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { continueRender, delayRender } from "remotion";
import { getAudioTracks } from "../editor-utils";
import type { ResolvedTimelineConfig } from "../types";

export type AudioClipEntry = {
  audioData: AudioData | null;
  clipAt: number;
  clipFrom: number;
  speed: number;
  volume: number;
  trackId: string;
};

type AudioDataContextValue = {
  clipEntries: Map<string, AudioClipEntry>;
  trackClipIds: Map<string, string[]>;
};

const EMPTY_AUDIO_DATA_CONTEXT: AudioDataContextValue = {
  clipEntries: new Map(),
  trackClipIds: new Map(),
};

export const AudioDataContext = createContext<AudioDataContextValue>(EMPTY_AUDIO_DATA_CONTEXT);

const getAudioClips = (config: ResolvedTimelineConfig) => {
  const audioTrackIds = new Set(getAudioTracks(config).map((track) => track.id));
  return config.clips.filter((clip) => audioTrackIds.has(clip.track));
};

const toAudioClipEntry = (
  clip: ResolvedTimelineConfig["clips"][number],
  audioData: AudioData | null,
): AudioClipEntry => {
  return {
    audioData,
    clipAt: clip.at,
    clipFrom: clip.from ?? 0,
    speed: clip.speed ?? 1,
    volume: clip.volume ?? 1,
    trackId: clip.track,
  };
};

const buildTrackClipIds = (config: ResolvedTimelineConfig): Map<string, string[]> => {
  const trackClipIds = new Map<string, string[]>();
  for (const clip of getAudioClips(config)) {
    const clipIds = trackClipIds.get(clip.track) ?? [];
    clipIds.push(clip.id);
    trackClipIds.set(clip.track, clipIds);
  }

  return trackClipIds;
};

type AudioDataProviderProps = {
  config: ResolvedTimelineConfig;
  fps: number;
  children: ReactNode;
};

export const AudioDataProvider: FC<AudioDataProviderProps> = ({ config, fps: _fps, children }) => {
  const audioClips = useMemo(() => getAudioClips(config), [config]);
  const trackClipIds = useMemo(() => buildTrackClipIds(config), [config]);
  const [clipEntries, setClipEntries] = useState<Map<string, AudioClipEntry>>(() => new Map());

  useEffect(() => {
    const baseEntries = new Map<string, AudioClipEntry>();
    for (const clip of audioClips) {
      baseEntries.set(clip.id, toAudioClipEntry(clip, null));
    }

    setClipEntries(baseEntries);

    const handle = delayRender("Loading audio analysis data");
    let isCancelled = false;
    let isReleased = false;
    const releaseRender = () => {
      if (isReleased) {
        return;
      }

      isReleased = true;
      continueRender(handle);
    };

    const clipsWithSrc = audioClips.filter((clip) => clip.assetEntry?.src);
    if (clipsWithSrc.length === 0) {
      releaseRender();
      return () => {
        releaseRender();
      };
    }

    void Promise.all(
      clipsWithSrc.map(async (clip) => {
        try {
          const audioData = await getAudioData(clip.assetEntry!.src);
          return [clip.id, audioData] as const;
        } catch (error) {
          console.warn(`Failed to load audio data for clip '${clip.id}'`, error);
          return [clip.id, null] as const;
        }
      }),
    ).then((results) => {
      if (isCancelled) {
        return;
      }

      const nextEntries = new Map(baseEntries);
      for (const [clipId, audioData] of results) {
        const baseEntry = nextEntries.get(clipId);
        if (!baseEntry) {
          continue;
        }

        nextEntries.set(clipId, {
          ...baseEntry,
          audioData,
        });
      }

      setClipEntries(nextEntries);
    }).finally(() => {
      releaseRender();
    });

    return () => {
      isCancelled = true;
      releaseRender();
    };
  }, [audioClips]);

  const value = useMemo<AudioDataContextValue>(() => {
    return {
      clipEntries,
      trackClipIds,
    };
  }, [clipEntries, trackClipIds]);

  return (
    <AudioDataContext.Provider value={value}>
      {children}
    </AudioDataContext.Provider>
  );
};

export const useAudioDataContext = (): AudioDataContextValue => {
  return useContext(AudioDataContext);
};
