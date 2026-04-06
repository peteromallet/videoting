import { useCallback, useRef } from "react";
import type { TimelineState } from "@xzdarcy/react-timeline-editor";
import type { PreviewHandle } from "@/tools/video-editor/components/PreviewPanel/RemotionPreview";

interface UseTimelineSyncOptions {
  timelineRef: React.RefObject<TimelineState | null>;
  previewRef: React.RefObject<PreviewHandle | null>;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  isSyncingFromPreviewRef: React.MutableRefObject<boolean>;
  isSyncingFromTimelineRef: React.MutableRefObject<boolean>;
}

export function useTimelineSync({
  timelineRef,
  previewRef,
  setCurrentTime,
  isSyncingFromPreviewRef,
  isSyncingFromTimelineRef,
}: UseTimelineSyncOptions) {
  const lastTimeUpdateRef = useRef(0);

  const onPreviewTimeUpdate = useCallback((time: number) => {
    if (isSyncingFromTimelineRef.current) {
      return;
    }

    timelineRef.current?.setTime(time);

    const now = performance.now();
    if (now - lastTimeUpdateRef.current > 250) {
      lastTimeUpdateRef.current = now;
      isSyncingFromPreviewRef.current = true;
      setCurrentTime(time);
      requestAnimationFrame(() => {
        isSyncingFromPreviewRef.current = false;
      });
    }
  }, [isSyncingFromPreviewRef, isSyncingFromTimelineRef, setCurrentTime, timelineRef]);

  const onCursorDrag = useCallback((time: number) => {
    if (isSyncingFromPreviewRef.current) {
      return;
    }

    isSyncingFromTimelineRef.current = true;
    previewRef.current?.seek(time);
    setCurrentTime(time);
    requestAnimationFrame(() => {
      isSyncingFromTimelineRef.current = false;
    });
  }, [isSyncingFromPreviewRef, isSyncingFromTimelineRef, previewRef, setCurrentTime]);

  const onClickTimeArea = useCallback((time: number) => {
    previewRef.current?.seek(time);
    setCurrentTime(time);
    return undefined;
  }, [previewRef, setCurrentTime]);

  return { onPreviewTimeUpdate, onCursorDrag, onClickTimeArea };
}
