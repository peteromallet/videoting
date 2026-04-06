import { useCallback, useRef, useState } from "react";
import type { TimelineState } from "@xzdarcy/react-timeline-editor";
import type { PreviewHandle } from "@/tools/video-editor/components/PreviewPanel/RemotionPreview";
import { useTimelineSync } from "@/tools/video-editor/hooks/useTimelineSync";

export interface UseTimelinePlaybackResult {
  currentTime: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  timelineRef: React.RefObject<TimelineState | null>;
  previewRef: React.RefObject<PreviewHandle | null>;
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  timelineWrapperRef: React.RefObject<HTMLDivElement | null>;
  onPreviewTimeUpdate: (time: number) => void;
  onCursorDrag: (time: number) => void;
  onClickTimeArea: (time: number) => undefined;
  formatTime: (time: number) => string;
}

export function useTimelinePlayback(): UseTimelinePlaybackResult {
  const timelineRef = useRef<TimelineState>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const timelineWrapperRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromPreview = useRef(false);
  const isSyncingFromTimeline = useRef(false);

  const [currentTime, setCurrentTime] = useState(0);

  const { onPreviewTimeUpdate, onCursorDrag, onClickTimeArea } = useTimelineSync({
    timelineRef,
    previewRef,
    setCurrentTime,
    isSyncingFromPreviewRef: isSyncingFromPreview,
    isSyncingFromTimelineRef: isSyncingFromTimeline,
  });

  const formatTime = useCallback((time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  }, []);

  return {
    currentTime,
    setCurrentTime,
    timelineRef,
    previewRef,
    playerContainerRef,
    timelineWrapperRef,
    onPreviewTimeUpdate,
    onCursorDrag,
    onClickTimeArea,
    formatTime,
  };
}
