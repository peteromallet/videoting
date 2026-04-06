import { memo, useCallback, useMemo } from "react";
import { Timeline } from "@xzdarcy/react-timeline-editor";
import type { TimelineAction } from "@xzdarcy/timeline-engine";
import { useEditorContext } from "@/tools/video-editor/contexts/TimelineContext";
import { ROW_HEIGHT, TIMELINE_START_LEFT } from "@/tools/video-editor/lib/coordinate-utils";
import { ClipAction } from "@/tools/video-editor/components/TimelineEditor/ClipAction";
import { TrackLabel } from "@/tools/video-editor/components/TimelineEditor/TrackLabel";
import { useCrossTrackDrag } from "@/tools/video-editor/hooks/useCrossTrackDrag";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import "@/tools/video-editor/components/TimelineEditor/timeline-editor-overrides.css";

function TimelineEditorComponent() {
  const {
    data,
    resolvedConfig,
    timelineRef,
    timelineWrapperRef,
    dataRef,
    moveClipToRow,
    createTrackAndMoveClip,
    setSelectedClipId,
    setSelectedTrackId,
    crossTrackActive,
    scale,
    scaleWidth,
    actionDragStateRef,
    clearActionDragState,
    selectedClipId,
    selectedTrackId,
    handleTrackPopoverChange,
    handleReorderTrack,
    handleRemoveTrack,
    onChange,
    onCursorDrag,
    onClickTimeArea,
    onActionMoveStart,
    onActionMoving,
    onActionMoveEnd,
    onActionResizeStart,
    onActionResizeEnd,
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
  } = useEditorContext();

  useCrossTrackDrag({
    timelineWrapperRef,
    dataRef,
    moveClipToRow,
    createTrackAndMoveClip,
    setSelectedClipId,
    setSelectedTrackId,
    crossTrackActive,
    rowHeight: ROW_HEIGHT,
    scale,
    scaleWidth,
    startLeft: TIMELINE_START_LEFT,
    actionDragStateRef,
    clearActionDragState,
  });

  const scaleCount = useMemo(() => {
    if (!data) {
      return 1;
    }

    let maxEnd = 0;
    for (const row of data.rows) {
      for (const action of row.actions) {
        if (action.end > maxEnd) {
          maxEnd = action.end;
        }
      }
    }

    return Math.ceil((maxEnd + 20) / scale) + 1;
  }, [data, scale]);

  const thumbnailMap = useMemo<Record<string, string>>(() => {
    if (!resolvedConfig) {
      return {};
    }

    return resolvedConfig.clips.reduce<Record<string, string>>((acc, clip) => {
      if (
        clip.clipType === "text"
        || clip.id.startsWith("uploading-")
        || !clip.assetEntry?.type?.startsWith("image")
      ) {
        return acc;
      }

      acc[clip.id] = clip.assetEntry.src;
      return acc;
    }, {});
  }, [resolvedConfig]);

  const handleClipSelect = useCallback((clipId: string, trackId: string) => {
    setSelectedClipId(clipId);
    setSelectedTrackId(trackId);
  }, [setSelectedClipId, setSelectedTrackId]);

  const pixelsPerSecond = scaleWidth / scale;
  const kindCountMap = useMemo<Record<string, number>>(() => {
    if (!data) {
      return {};
    }

    return data.tracks.reduce<Record<string, number>>((counts, track) => {
      counts[track.kind] = (counts[track.kind] ?? 0) + 1;
      return counts;
    }, {});
  }, [data]);

  const getActionRender = useCallback((action: TimelineAction) => {
    const clipMeta = data?.meta[action.id];
    if (!clipMeta) {
      return null;
    }

    // Skip thumbnail for clips narrower than 40px — invisible at that size
    const clipWidthPx = (action.end - action.start) * pixelsPerSecond;
    const thumb = clipWidthPx >= 40 ? thumbnailMap[action.id] : undefined;

    return (
      <ClipAction
        action={action}
        clipMeta={clipMeta}
        isSelected={selectedClipId === action.id}
        thumbnailSrc={thumb}
        onSelect={handleClipSelect}
      />
    );
  }, [data, handleClipSelect, pixelsPerSecond, selectedClipId, thumbnailMap]);

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-full w-full overflow-hidden rounded-lg border border-border/70 bg-editor-crust">
      <div className="flex w-32 shrink-0 flex-col overflow-y-auto border-r border-border/40" style={{ paddingTop: 30 }}>
        {data.tracks.map((track, index) => {
          const prevTrack = index > 0 ? data.tracks[index - 1] : null;
          const showDivider = prevTrack && prevTrack.kind !== track.kind;
          return (
            <div key={track.id}>
              {showDivider && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 border-b border-border/40" style={{ height: 2, background: "hsl(var(--border) / 0.6)" }} />
              )}
              <TrackLabel
                track={track}
                isSelected={selectedTrackId === track.id}
                trackCount={data.tracks.length}
                trackIndex={index}
                sameKindCount={kindCountMap[track.kind] ?? 0}
                onSelect={setSelectedTrackId}
                onChange={handleTrackPopoverChange}
                onReorder={handleReorderTrack}
                onRemove={handleRemoveTrack}
              />
            </div>
          );
        })}
      </div>
      <div
        ref={timelineWrapperRef}
        className="timeline-wrapper relative h-full min-w-0 flex-1 overflow-hidden"
        onDragOver={onTimelineDragOver}
        onDragLeave={onTimelineDragLeave}
        onDrop={onTimelineDrop}
      >
          <Timeline
            ref={timelineRef}
            style={{ width: "100%", height: "100%" }}
            editorData={data.rows}
            effects={data.effects}
            onChange={onChange}
            scale={scale}
            scaleWidth={scaleWidth}
            minScaleCount={scaleCount}
            maxScaleCount={scaleCount}
            scaleSplitCount={5}
            startLeft={TIMELINE_START_LEFT}
            rowHeight={ROW_HEIGHT}
            autoScroll
            dragLine
            getActionRender={getActionRender}
            onCursorDrag={onCursorDrag}
            onClickTimeArea={onClickTimeArea}
            onActionMoveStart={onActionMoveStart}
            onActionMoving={onActionMoving}
            onActionMoveEnd={onActionMoveEnd}
            onActionResizeStart={onActionResizeStart}
            onActionResizeEnd={onActionResizeEnd}
          />
      </div>
    </div>
  );
}

const MemoizedTimelineEditor = memo(TimelineEditorComponent);

export function TimelineEditor() {
  return <MemoizedTimelineEditor />;
}
