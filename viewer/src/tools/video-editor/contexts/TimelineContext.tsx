import { createContext, useContext } from "react";
import { useTimelineState, type UseTimelineStateResult } from "@/tools/video-editor/hooks/useTimelineState";

const TimelineContext = createContext<UseTimelineStateResult | null>(null);

export function TimelineProvider({ children }: { children: React.ReactNode }) {
  const value = useTimelineState();
  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export function useTimelineContext(): UseTimelineStateResult {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error("useTimelineContext must be used within TimelineProvider");
  }

  return context;
}
