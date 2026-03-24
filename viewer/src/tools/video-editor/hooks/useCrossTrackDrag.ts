import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { TrackKind } from "@shared/types";
import { rawRowIndexFromY } from "@/tools/video-editor/lib/coordinate-utils";
import type { TimelineData } from "@/tools/video-editor/lib/timeline-data";

const DRAG_THRESHOLD_PX = 10;

export interface ActionDragState {
  rowId: string;
  initialStart: number;
  initialEnd: number;
  latestStart: number;
  latestEnd: number;
}

interface UseCrossTrackDragOptions {
  timelineWrapperRef: RefObject<HTMLDivElement | null>;
  dataRef: MutableRefObject<TimelineData | null>;
  moveClipToRow: (clipId: string, targetRowId: string, newStartTime?: number) => void;
  createTrackAndMoveClip: (clipId: string, kind: TrackKind, newStartTime?: number) => void;
  setSelectedClipId: Dispatch<SetStateAction<string | null>>;
  setSelectedTrackId: Dispatch<SetStateAction<string | null>>;
  crossTrackActive: MutableRefObject<boolean>;
  rowHeight: number;
  scale: number;
  scaleWidth: number;
  startLeft: number;
  actionDragStateRef: MutableRefObject<Record<string, ActionDragState>>;
  clearActionDragState: (clipId: string) => void;
}

interface DragSession {
  pointerId: number;
  clipId: string;
  sourceRowId: string;
  sourceKind: TrackKind;
  startClientY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  latestStart: number;
  clipEl: HTMLElement;
  moveListener: (event: PointerEvent) => void;
  upListener: (event: PointerEvent) => void;
  cancelListener: (event: PointerEvent) => void;
  ghostEl: HTMLElement | null;
  highlightedRowEl: HTMLElement | null;
  editAreaEl: HTMLElement | null;
  gridEl: HTMLElement | null;
  targetRowId: string | null;
  createTrackOnDrop: boolean;
}

export const useCrossTrackDrag = ({
  timelineWrapperRef,
  dataRef,
  moveClipToRow,
  createTrackAndMoveClip,
  setSelectedClipId,
  setSelectedTrackId,
  crossTrackActive,
  rowHeight,
  scale,
  scaleWidth,
  startLeft,
  actionDragStateRef,
  clearActionDragState,
}: UseCrossTrackDragOptions): void => {
  const dragSessionRef = useRef<DragSession | null>(null);

  useEffect(() => {
    const wrapper = timelineWrapperRef.current;
    if (!wrapper) {
      return undefined;
    }

    const clearDropIndicators = (session: DragSession | null) => {
      if (session?.highlightedRowEl) {
        session.highlightedRowEl.remove();
        session.highlightedRowEl = null;
      }
      session?.editAreaEl?.classList.remove("drop-target-new-track");
    };

    const clearSession = (session: DragSession | null, deferDeactivate = false) => {
      if (!session) {
        if (!deferDeactivate) {
          crossTrackActive.current = false;
        }
        return;
      }

      clearDropIndicators(session);
      session.ghostEl?.remove();
      window.removeEventListener("pointermove", session.moveListener);
      window.removeEventListener("pointerup", session.upListener);
      window.removeEventListener("pointercancel", session.cancelListener);
      try {
        if (session.clipEl.hasPointerCapture(session.pointerId)) {
          session.clipEl.releasePointerCapture(session.pointerId);
        }
      } catch {
        // Pointer capture may already be released.
      }

      dragSessionRef.current = null;
      if (deferDeactivate) {
        window.requestAnimationFrame(() => {
          if (!dragSessionRef.current) {
            crossTrackActive.current = false;
          }
        });
      } else {
        crossTrackActive.current = false;
      }
    };

    const updateGhostPosition = (session: DragSession, event: PointerEvent) => {
      if (!session.ghostEl) {
        return;
      }

      session.ghostEl.style.left = `${event.clientX - session.pointerOffsetX}px`;
      session.ghostEl.style.top = `${event.clientY - session.pointerOffsetY}px`;
    };

    const getTimelineElements = () => {
      const nextWrapper = timelineWrapperRef.current;
      if (!nextWrapper) {
        return { editAreaEl: null, gridEl: null };
      }

      return {
        editAreaEl: nextWrapper.querySelector<HTMLElement>(".timeline-editor-edit-area"),
        gridEl: nextWrapper.querySelector<HTMLElement>(".ReactVirtualized__Grid"),
      };
    };

    const getDropStartTime = (session: DragSession, clientX: number): number => {
      const { editAreaEl, gridEl } = getTimelineElements();
      if (!editAreaEl || !gridEl) {
        return session.latestStart;
      }

      const pixelsPerSecond = scaleWidth / scale;
      const editAreaRect = editAreaEl.getBoundingClientRect();
      const actionLeft = clientX - editAreaRect.left + gridEl.scrollLeft - session.pointerOffsetX;
      return Math.max(0, (actionLeft - startLeft) / pixelsPerSecond);
    };

    const updateDropTarget = (session: DragSession, clientY: number) => {
      const current = dataRef.current;
      if (!current) {
        return;
      }

      const { editAreaEl, gridEl } = getTimelineElements();
      session.editAreaEl = editAreaEl;
      session.gridEl = gridEl;

      clearDropIndicators(session);
      session.highlightedRowEl = null;
      session.targetRowId = null;
      session.createTrackOnDrop = false;

      if (!editAreaEl || !gridEl) {
        return;
      }

      const editAreaRect = editAreaEl.getBoundingClientRect();
      const rowIndex = rawRowIndexFromY(clientY, editAreaRect.top, gridEl.scrollTop, rowHeight);

      if (rowIndex >= current.rows.length) {
        session.createTrackOnDrop = true;
        editAreaEl.classList.add("drop-target-new-track");
        return;
      }

      const targetTrack = current.tracks[rowIndex];
      if (!targetTrack || targetTrack.kind !== session.sourceKind) {
        return;
      }

      // Use mathematical positioning for the highlight overlay
      // instead of indexing into querySelectorAll (which breaks with virtualized rows)
      const rowScreenTop = editAreaRect.top + rowIndex * rowHeight - gridEl.scrollTop;
      const highlightEl = session.highlightedRowEl ?? (() => {
        const el = document.createElement("div");
        el.className = "cross-track-drop-highlight";
        el.style.cssText = `position:fixed;pointer-events:none;z-index:99998;`;
        document.body.appendChild(el);
        return el;
      })();
      highlightEl.style.top = `${rowScreenTop}px`;
      highlightEl.style.left = `${editAreaRect.left}px`;
      highlightEl.style.width = `${editAreaRect.width}px`;
      highlightEl.style.height = `${rowHeight}px`;
      highlightEl.style.background = `rgb(137 180 250 / 0.12)`;
      session.highlightedRowEl = highlightEl;
      session.targetRowId = targetTrack.id;
    };

    const createGhost = (clipEl: HTMLElement): HTMLElement => {
      const rect = clipEl.getBoundingClientRect();
      const ghostEl = clipEl.cloneNode(true) as HTMLElement;
      ghostEl.classList.add("cross-track-ghost");
      ghostEl.style.width = `${rect.width}px`;
      ghostEl.style.height = `${rect.height}px`;
      document.body.appendChild(ghostEl);
      return ghostEl;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const clipTarget = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".clip-action") : null;
      if (!clipTarget || (event.target instanceof HTMLElement && event.target.closest("[data-delete-clip='true']"))) {
        return;
      }

      const clipId = clipTarget.dataset.clipId;
      const rowId = clipTarget.dataset.rowId;
      if (!clipId || !rowId) {
        return;
      }

      const current = dataRef.current;
      const sourceTrack = current?.tracks.find((track) => track.id === rowId);
      const sourceRow = current?.rows.find((row) => row.id === rowId);
      const sourceAction = sourceRow?.actions.find((action) => action.id === clipId);
      if (!current || !sourceTrack || !sourceAction) {
        return;
      }

      clearSession(dragSessionRef.current);

      const clipRect = clipTarget.getBoundingClientRect();
      const initialStart = actionDragStateRef.current[clipId]?.latestStart ?? sourceAction.start;
      setSelectedClipId(clipId);
      setSelectedTrackId(rowId);
      clipTarget.setPointerCapture(event.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || moveEvent.pointerId !== session.pointerId) {
          return;
        }

        const latestStart = getDropStartTime(session, moveEvent.clientX);
        session.latestStart = latestStart;
        const dragState = actionDragStateRef.current[session.clipId];
        if (dragState) {
          const duration = dragState.initialEnd - dragState.initialStart;
          dragState.latestStart = latestStart;
          dragState.latestEnd = latestStart + duration;
        }

        if (!crossTrackActive.current && Math.abs(moveEvent.clientY - session.startClientY) >= DRAG_THRESHOLD_PX) {
          crossTrackActive.current = true;
          session.ghostEl = createGhost(session.clipEl);
          updateGhostPosition(session, moveEvent);
          updateDropTarget(session, moveEvent.clientY);
        }

        if (!crossTrackActive.current) {
          return;
        }

        moveEvent.preventDefault();
        updateGhostPosition(session, moveEvent);
        updateDropTarget(session, moveEvent.clientY);
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || upEvent.pointerId !== session.pointerId) {
          return;
        }

        const nextStart = actionDragStateRef.current[session.clipId]?.latestStart ?? session.latestStart;
        if (crossTrackActive.current) {
          upEvent.preventDefault();
          if (session.createTrackOnDrop) {
            createTrackAndMoveClip(session.clipId, session.sourceKind, nextStart);
          } else if (session.targetRowId) {
            moveClipToRow(session.clipId, session.targetRowId, nextStart);
            setSelectedTrackId(session.targetRowId);
          } else {
            moveClipToRow(session.clipId, session.sourceRowId, nextStart);
            setSelectedTrackId(session.sourceRowId);
          }
          setSelectedClipId(session.clipId);
          clearActionDragState(session.clipId);
          clearSession(session, true);
          return;
        }

        clearActionDragState(session.clipId);
        clearSession(session);
      };

      const handlePointerCancel = (cancelEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || cancelEvent.pointerId !== session.pointerId) {
          return;
        }

        clearActionDragState(session.clipId);
        clearSession(session);
      };

      dragSessionRef.current = {
        pointerId: event.pointerId,
        clipId,
        sourceRowId: rowId,
        sourceKind: sourceTrack.kind,
        startClientY: event.clientY,
        pointerOffsetX: event.clientX - clipRect.left,
        pointerOffsetY: event.clientY - clipRect.top,
        latestStart: initialStart,
        clipEl: clipTarget,
        moveListener: handlePointerMove,
        upListener: handlePointerUp,
        cancelListener: handlePointerCancel,
        ghostEl: null,
        highlightedRowEl: null,
        editAreaEl: null,
        gridEl: null,
        targetRowId: null,
        createTrackOnDrop: false,
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
    };

    const handleBlur = () => {
      clearSession(dragSessionRef.current);
    };

    wrapper.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("blur", handleBlur);
    return () => {
      wrapper.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("blur", handleBlur);
      clearSession(dragSessionRef.current);
    };
  }, [
    actionDragStateRef,
    clearActionDragState,
    createTrackAndMoveClip,
    crossTrackActive,
    dataRef,
    moveClipToRow,
    rowHeight,
    scale,
    scaleWidth,
    setSelectedClipId,
    setSelectedTrackId,
    startLeft,
    timelineWrapperRef,
  ]);
};
