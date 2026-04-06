import { createContext, useContext, useMemo } from "react";
import {
  useTimelineState,
  type TimelineChromeContextValue,
  type TimelineEditorContextValue,
  type TimelinePlaybackContextValue,
} from "@/tools/video-editor/hooks/useTimelineState";

const TimelineEditorContext = createContext<TimelineEditorContextValue | null>(null);
const TimelineChromeContext = createContext<TimelineChromeContextValue | null>(null);
const TimelinePlaybackContext = createContext<TimelinePlaybackContextValue | null>(null);

export function TimelineProvider({ children }: { children: React.ReactNode }) {
  const { editor, chrome, playback } = useTimelineState();

  return (
    <TimelineEditorContext.Provider value={editor}>
      <TimelineChromeContext.Provider value={chrome}>
        <TimelinePlaybackContext.Provider value={playback}>{children}</TimelinePlaybackContext.Provider>
      </TimelineChromeContext.Provider>
    </TimelineEditorContext.Provider>
  );
}

export function useEditorContext(): TimelineEditorContextValue {
  const context = useContext(TimelineEditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within TimelineProvider");
  }

  return context;
}

export function useChromeContext(): TimelineChromeContextValue {
  const context = useContext(TimelineChromeContext);
  if (!context) {
    throw new Error("useChromeContext must be used within TimelineProvider");
  }

  return context;
}

export function usePlaybackContext(): TimelinePlaybackContextValue {
  const context = useContext(TimelinePlaybackContext);
  if (!context) {
    throw new Error("usePlaybackContext must be used within TimelineProvider");
  }

  return context;
}

export function useTimelineContext(): TimelineEditorContextValue & TimelineChromeContextValue & TimelinePlaybackContextValue {
  const editor = useEditorContext();
  const chrome = useChromeContext();
  const playback = usePlaybackContext();

  return useMemo(() => ({ ...editor, ...chrome, ...playback }), [chrome, editor, playback]);
}
