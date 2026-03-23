import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { TimelineRow } from "@xzdarcy/timeline-engine";
import type { ClipMeta } from "./timeline-data";

interface ActiveOverlay {
  actionId: string;
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

interface Props {
  rows: TimelineRow[];
  meta: Record<string, ClipMeta>;
  currentTime: number;
  playerContainerRef: RefObject<HTMLDivElement | null>;
  backgroundScale: number;
  compositionWidth: number;
  compositionHeight: number;
  onOverlayChange: (actionId: string, patch: Partial<ClipMeta>) => void;
}

type DragMode = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se";
type OverlayLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
};

export default function OverlayEditor({
  rows,
  meta,
  currentTime,
  playerContainerRef,
  backgroundScale,
  compositionWidth,
  compositionHeight,
  onOverlayChange,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [layout, setLayout] = useState<OverlayLayout | null>(null);
  const dragState = useRef<{
    mode: DragMode;
    actionId: string;
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const layoutRef = useRef<OverlayLayout | null>(null);

  const activeOverlays = useMemo(() => {
    const overlayRow = rows.find((row) => row.id === "row-overlay");
    if (!overlayRow) {
      return [];
    }

    const overlays: ActiveOverlay[] = [];
    for (const action of overlayRow.actions) {
      if (currentTime < action.start || currentTime >= action.end) {
        continue;
      }

      const clipMeta = meta[action.id];
      if (!clipMeta || clipMeta.track !== "overlay") {
        continue;
      }

      overlays.push({
        actionId: action.id,
        asset: clipMeta.asset,
        x: clipMeta.x ?? 0,
        y: clipMeta.y ?? 0,
        width: clipMeta.width ?? 320,
        height: clipMeta.height ?? 240,
        opacity: clipMeta.opacity ?? 1,
      });
    }

    return overlays;
  }, [currentTime, meta, rows]);

  const computeLayout = useCallback((): OverlayLayout | null => {
    const player = playerContainerRef.current;
    if (!player) {
      return null;
    }

    const parent = player.offsetParent as HTMLElement | null;
    if (!parent) {
      return null;
    }

    const rect = player.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const scaledWidth = rect.width * backgroundScale;
    const scaledHeight = rect.height * backgroundScale;

    return {
      left: rect.left - parentRect.left,
      top: rect.top - parentRect.top,
      width: rect.width,
      height: rect.height,
      offsetX: (rect.width - scaledWidth) / 2,
      offsetY: (rect.height - scaledHeight) / 2,
      scaleX: (rect.width / compositionWidth) * backgroundScale,
      scaleY: (rect.height / compositionHeight) * backgroundScale,
    };
  }, [backgroundScale, compositionHeight, compositionWidth, playerContainerRef]);

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

  const onMouseDown = useCallback((event: React.MouseEvent, actionId: string, mode: DragMode) => {
    event.stopPropagation();
    event.preventDefault();

    const clipMeta = meta[actionId];
    if (!clipMeta) {
      return;
    }

    dragState.current = {
      mode,
      actionId,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX: clipMeta.x ?? 0,
      startY: clipMeta.y ?? 0,
      startW: clipMeta.width ?? 320,
      startH: clipMeta.height ?? 240,
    };
    setSelected(actionId);
  }, [meta]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const state = dragState.current;
      const currentLayout = layoutRef.current;
      if (!state || !currentLayout) {
        return;
      }

      const dx = (event.clientX - state.startMouseX) / currentLayout.scaleX;
      const dy = (event.clientY - state.startMouseY) / currentLayout.scaleY;

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
        nextWidth = Math.max(20, state.startW + dx);
        nextHeight = Math.max(20, state.startH + dy);
      } else if (state.mode === "resize-sw") {
        nextX = state.startX + dx;
        nextWidth = Math.max(20, state.startW - dx);
        nextHeight = Math.max(20, state.startH + dy);
      } else if (state.mode === "resize-ne") {
        nextWidth = Math.max(20, state.startW + dx);
        nextY = state.startY + dy;
        nextHeight = Math.max(20, state.startH - dy);
      } else if (state.mode === "resize-nw") {
        nextX = state.startX + dx;
        nextY = state.startY + dy;
        nextWidth = Math.max(20, state.startW - dx);
        nextHeight = Math.max(20, state.startH - dy);
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
  }, [onOverlayChange]);

  if (activeOverlays.length === 0 || !layout) {
    return null;
  }
  const containerStyle: React.CSSProperties = {
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
  };

  return (
    <div className="overlay-editor" style={containerStyle} onClick={() => setSelected(null)}>
      {activeOverlays.map((overlay) => {
        const isSelected = selected === overlay.actionId;
        const style: React.CSSProperties = {
          left: layout.offsetX + overlay.x * layout.scaleX,
          top: layout.offsetY + overlay.y * layout.scaleY,
          width: overlay.width * layout.scaleX,
          height: overlay.height * layout.scaleY,
        };

        return (
          <div
            key={overlay.actionId}
            className={`overlay-box${isSelected ? " selected" : ""}`}
            style={style}
            onMouseDown={(event) => onMouseDown(event, overlay.actionId, "move")}
            onClick={(event) => {
              event.stopPropagation();
              setSelected(overlay.actionId);
            }}
          >
            <span className="overlay-label">{overlay.asset}</span>
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
