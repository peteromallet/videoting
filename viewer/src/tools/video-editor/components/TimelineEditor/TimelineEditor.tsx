import { useMemo } from "react";
import { Timeline } from "@xzdarcy/react-timeline-editor";
import { useTimelineContext } from "@/tools/video-editor/contexts/TimelineContext";
import { ROW_HEIGHT, TIMELINE_START_LEFT } from "@/tools/video-editor/lib/coordinate-utils";
import { ClipAction } from "@/tools/video-editor/components/TimelineEditor/ClipAction";
import { TrackLabel } from "@/tools/video-editor/components/TimelineEditor/TrackLabel";
import { useCrossTrackDrag } from "@/tools/video-editor/hooks/useCrossTrackDrag";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import "@/tools/video-editor/components/TimelineEditor/timeline-editor-overrides.css";

export function TimelineEditor() {
  const {
    data,
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
    handleDeleteClip,
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
  } = useTimelineContext();

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

  if (!data) {
    return null;
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-border/70 bg-editor-crust">
      <div
        ref={timelineWrapperRef}
        className="timeline-wrapper h-full w-full overflow-hidden"
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
            getActionRender={(action) => {
              const clipMeta = data.meta[action.id];
              if (!clipMeta) {
                return null;
              }

              return (
                <div className="group h-full">
                  <ClipAction
                    action={action}
                    clipMeta={clipMeta}
                    isSelected={selectedClipId === action.id}
                    onSelect={() => {
                      setSelectedClipId(action.id);
                      setSelectedTrackId(clipMeta.track);
                    }}
                    onDelete={() => handleDeleteClip(action.id)}
                  />
                </div>
              );
            }}
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
