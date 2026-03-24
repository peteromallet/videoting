import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { TimelineRow } from "@xzdarcy/timeline-engine";
import type { ClipMeta } from "./timeline-data";

interface ActiveOverlay {
  actionId: string;
  label: string;
  track: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  rows: TimelineRow[];
  meta: Record<string, ClipMeta>;
  currentTime: number;
  playerContainerRef: RefObject<HTMLDivElement | null>;
  trackScaleMap: Record<string, number>;
  compositionWidth: number;
  compositionHeight: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onOverlayChange: (actionId: string, patch: Partial<ClipMeta>) => void;
}

type DragMode = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se";
type OverlayLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const MIN_CLIP_SIZE = 20;

const hasPositionOverride = (clipMeta: ClipMeta | undefined): boolean => {
  return Boolean(
    clipMeta
    && (
      clipMeta.x !== undefined
      || clipMeta.y !== undefined
      || clipMeta.width !== undefined
      || clipMeta.height !== undefined
    ),
  );
};

export default function OverlayEditor({
  rows,
  meta,
  currentTime,
  playerContainerRef,
  trackScaleMap,
  compositionWidth,
  compositionHeight,
  selectedClipId,
  onSelectClip,
  onOverlayChange,
}: Props) {
  const [layout, setLayout] = useState<OverlayLayout | null>(null);
  const dragState = useRef<{
    mode: DragMode;
    actionId: string;
    trackId: string;
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const layoutRef = useRef<OverlayLayout | null>(null);

  const activeOverlays = useMemo(() => {
    const overlays: ActiveOverlay[] = [];
    for (const row of rows) {
      if (!row.id.startsWith("V")) {
        continue;
      }

      for (const action of row.actions) {
        if (currentTime < action.start || currentTime >= action.end) {
          continue;
        }

        const clipMeta = meta[action.id];
        if (!clipMeta || clipMeta.track !== row.id) {
          continue;
        }

        const isSelected = selectedClipId === action.id;
        const isPositioned = clipMeta.clipType === "text" || hasPositionOverride(clipMeta);
        if (!isPositioned && !isSelected) {
          continue;
        }

        const useFullFrameBounds = isSelected && !hasPositionOverride(clipMeta);
        overlays.push({
          actionId: action.id,
          label: clipMeta.asset ?? clipMeta.text?.content ?? action.id,
          track: row.id,
          x: clipMeta.x ?? 0,
          y: clipMeta.y ?? 0,
          width: clipMeta.width ?? (useFullFrameBounds ? compositionWidth : 320),
          height: clipMeta.height ?? (useFullFrameBounds ? compositionHeight : 240),
        });
      }
    }

    return overlays;
  }, [compositionHeight, compositionWidth, currentTime, meta, rows, selectedClipId]);

  const getTrackProjection = useCallback((trackId: string, currentLayout: OverlayLayout) => {
    const trackScale = trackScaleMap[trackId] ?? 1;
    const scaledWidth = currentLayout.width * trackScale;
    const scaledHeight = currentLayout.height * trackScale;

    return {
      offsetX: (currentLayout.width - scaledWidth) / 2,
      offsetY: (currentLayout.height - scaledHeight) / 2,
      scaleX: (currentLayout.width / compositionWidth) * trackScale,
      scaleY: (currentLayout.height / compositionHeight) * trackScale,
    };
  }, [compositionHeight, compositionWidth, trackScaleMap]);

  const computeLayout = useCallback((): OverlayLayout | null => {
    const player = playerContainerRef.current;
    if (!player || compositionWidth <= 0 || compositionHeight <= 0) {
      return null;
    }

    const parent = player.offsetParent as HTMLElement | null;
    if (!parent) {
      return null;
    }

    const playerRect = player.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    if (playerRect.width <= 0 || playerRect.height <= 0) {
      return null;
    }

    const videoAspectRatio = compositionWidth / compositionHeight;
    const containerAspectRatio = playerRect.width / playerRect.height;
    const videoWidth = containerAspectRatio > videoAspectRatio
      ? playerRect.height * videoAspectRatio
      : playerRect.width;
    const videoHeight = containerAspectRatio > videoAspectRatio
      ? playerRect.height
      : playerRect.width / videoAspectRatio;

    return {
      left: playerRect.left - parentRect.left + (playerRect.width - videoWidth) / 2,
      top: playerRect.top - parentRect.top + (playerRect.height - videoHeight) / 2,
      width: videoWidth,
      height: videoHeight,
    };
  }, [compositionHeight, compositionWidth, playerContainerRef]);

  useEffect(() => {
    const updateLayout = () => {
      const nextLayout = computeLayout();
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);

    const player = playerContainerRef.current;
    const parent = player?.offsetParent as HTMLElement | null;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateLayout) : null;
    if (observer && player) {
      observer.observe(player);
    }
    if (observer && parent) {
      observer.observe(parent);
    }

    return () => {
      window.removeEventListener("resize", updateLayout);
      observer?.disconnect();
    };
  }, [computeLayout, playerContainerRef]);

  const onMouseDown = useCallback((event: ReactMouseEvent, actionId: string, mode: DragMode) => {
    event.stopPropagation();
    event.preventDefault();

    const clipMeta = meta[actionId];
    if (!clipMeta) {
      return;
    }

    const needsInitialization = !hasPositionOverride(clipMeta);
    const startX = clipMeta.x ?? 0;
    const startY = clipMeta.y ?? 0;
    const startW = clipMeta.width ?? (needsInitialization ? compositionWidth : 320);
    const startH = clipMeta.height ?? (needsInitialization ? compositionHeight : 240);

    if (needsInitialization) {
      onOverlayChange(actionId, {
        x: 0,
        y: 0,
        width: compositionWidth,
        height: compositionHeight,
      });
    }

    dragState.current = {
      mode,
      actionId,
      trackId: clipMeta.track,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX,
      startY,
      startW,
      startH,
    };
    onSelectClip(actionId);
  }, [compositionHeight, compositionWidth, meta, onOverlayChange, onSelectClip]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const state = dragState.current;
      const currentLayout = layoutRef.current;
      if (!state || !currentLayout) {
        return;
      }

      const projection = getTrackProjection(state.trackId, currentLayout);
      const dx = (event.clientX - state.startMouseX) / projection.scaleX;
      const dy = (event.clientY - state.startMouseY) / projection.scaleY;

      if (state.mode === "move") {
        onOverlayChange(state.actionId, {
          x: Math.round(state.startX + dx),
          y: Math.round(state.startY + dy),
        });
        return;
      }

      let nextX = state.startX;
      let nextY = state.startY;
      let nextWidth = state.startW;
      let nextHeight = state.startH;

      if (state.mode === "resize-se") {
        nextWidth = Math.max(MIN_CLIP_SIZE, state.startW + dx);
        nextHeight = Math.max(MIN_CLIP_SIZE, state.startH + dy);
      } else if (state.mode === "resize-sw") {
        nextWidth = Math.max(MIN_CLIP_SIZE, state.startW - dx);
        nextHeight = Math.max(MIN_CLIP_SIZE, state.startH + dy);
        nextX = state.startX + (state.startW - nextWidth);
      } else if (state.mode === "resize-ne") {
        nextWidth = Math.max(MIN_CLIP_SIZE, state.startW + dx);
        nextHeight = Math.max(MIN_CLIP_SIZE, state.startH - dy);
        nextY = state.startY + (state.startH - nextHeight);
      } else if (state.mode === "resize-nw") {
        nextWidth = Math.max(MIN_CLIP_SIZE, state.startW - dx);
        nextHeight = Math.max(MIN_CLIP_SIZE, state.startH - dy);
        nextX = state.startX + (state.startW - nextWidth);
        nextY = state.startY + (state.startH - nextHeight);
      }

      onOverlayChange(state.actionId, {
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
      });
    };

    const onMouseUp = () => {
      dragState.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [getTrackProjection, onOverlayChange]);

  if (activeOverlays.length === 0 || !layout) {
    return null;
  }

  const containerStyle: CSSProperties = {
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
  };

  return (
    <div className="overlay-editor" style={containerStyle}>
      {activeOverlays.map((overlay) => {
        const isSelected = selectedClipId === overlay.actionId;
        const projection = getTrackProjection(overlay.track, layout);
        const style: CSSProperties = {
          left: projection.offsetX + overlay.x * projection.scaleX,
          top: projection.offsetY + overlay.y * projection.scaleY,
          width: overlay.width * projection.scaleX,
          height: overlay.height * projection.scaleY,
        };

        return (
          <div
            key={overlay.actionId}
            className={`overlay-box${isSelected ? " selected" : ""}`}
            style={style}
            onMouseDown={(event) => onMouseDown(event, overlay.actionId, "move")}
            onClick={(event) => {
              event.stopPropagation();
              onSelectClip(overlay.actionId);
            }}
          >
            <span className="overlay-label">{overlay.label}</span>
            {isSelected ? (
              <>
                <div className="overlay-handle nw" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-nw")} />
                <div className="overlay-handle ne" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-ne")} />
                <div className="overlay-handle sw" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-sw")} />
                <div className="overlay-handle se" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-se")} />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
