import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { TimelineRow } from "@xzdarcy/timeline-engine";
import type { ClipMeta } from "@/tools/video-editor/lib/timeline-data";

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
  return Boolean(clipMeta && (clipMeta.x !== undefined || clipMeta.y !== undefined || clipMeta.width !== undefined || clipMeta.height !== undefined));
};

const usesAbsoluteCompositionSpace = (clipMeta: ClipMeta | undefined): boolean => {
  return Boolean(clipMeta && (clipMeta.clipType === "text" || hasPositionOverride(clipMeta)));
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
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const dragState = useRef<{
    mode: DragMode;
    actionId: string;
    startMouseX: number;
    startMouseY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    effectiveScale: number;
  } | null>(null);
  const layoutRef = useRef<OverlayLayout | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const getTrackDefaultBounds = useCallback((trackId: string) => {
    const trackScale = Math.max(trackScaleMap[trackId] ?? 1, 0.01);
    return {
      x: Math.round(compositionWidth * (1 - trackScale) / 2),
      y: Math.round(compositionHeight * (1 - trackScale) / 2),
      width: Math.round(compositionWidth * trackScale),
      height: Math.round(compositionHeight * trackScale),
    };
  }, [compositionHeight, compositionWidth, trackScaleMap]);

  const getClipBounds = useCallback((clipMeta: ClipMeta, trackId: string) => {
    if (clipMeta.clipType === "text") {
      return {
        x: clipMeta.x ?? 0,
        y: clipMeta.y ?? 0,
        width: clipMeta.width ?? 640,
        height: clipMeta.height ?? 160,
      };
    }

    if (hasPositionOverride(clipMeta)) {
      return {
        x: clipMeta.x ?? 0,
        y: clipMeta.y ?? 0,
        width: clipMeta.width ?? compositionWidth,
        height: clipMeta.height ?? compositionHeight,
      };
    }

    return getTrackDefaultBounds(trackId);
  }, [compositionHeight, compositionWidth, getTrackDefaultBounds]);

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
        const isPositioned = usesAbsoluteCompositionSpace(clipMeta);
        if (!isPositioned && !isSelected) {
          continue;
        }

        const bounds = getClipBounds(clipMeta, row.id);
        overlays.push({
          actionId: action.id,
          label: clipMeta.asset ?? clipMeta.text?.content ?? action.id,
          track: row.id,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
      }
    }

    return overlays;
  }, [currentTime, getClipBounds, meta, rows, selectedClipId]);

  const getTrackProjection = useCallback((currentLayout: OverlayLayout, effectiveScale: number) => {
    const trackScale = Math.max(effectiveScale, 0.01);
    const scaledWidth = currentLayout.width * trackScale;
    const scaledHeight = currentLayout.height * trackScale;

    return {
      offsetX: (currentLayout.width - scaledWidth) / 2,
      offsetY: (currentLayout.height - scaledHeight) / 2,
      scaleX: (currentLayout.width / compositionWidth) * trackScale,
      scaleY: (currentLayout.height / compositionHeight) * trackScale,
    };
  }, [compositionHeight, compositionWidth]);

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
    const videoWidth = containerAspectRatio > videoAspectRatio ? playerRect.height * videoAspectRatio : playerRect.width;
    const videoHeight = containerAspectRatio > videoAspectRatio ? playerRect.height : playerRect.width / videoAspectRatio;

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

  useEffect(() => {
    if (!editingClipId) {
      return;
    }

    const clipMeta = meta[editingClipId];
    if (clipMeta?.clipType === "text" && activeOverlays.some((overlay) => overlay.actionId === editingClipId)) {
      return;
    }

    const clearEditor = window.setTimeout(() => {
      setEditingClipId(null);
      setEditText("");
    }, 0);

    return () => {
      window.clearTimeout(clearEditor);
    };
  }, [activeOverlays, editingClipId, meta]);

  useEffect(() => {
    if (!editingClipId) {
      return;
    }

    editorRef.current?.focus();
    const cursorPosition = editorRef.current?.value.length ?? 0;
    editorRef.current?.setSelectionRange(cursorPosition, cursorPosition);
  }, [editingClipId]);

  const onMouseDown = useCallback((event: ReactMouseEvent, actionId: string, mode: DragMode) => {
    if (editingClipId === actionId) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    const clipMeta = meta[actionId];
    if (!clipMeta) {
      return;
    }

    const needsInitialization = clipMeta.clipType !== "text" && !hasPositionOverride(clipMeta);
    const bounds = getClipBounds(clipMeta, clipMeta.track);
    const startX = bounds.x;
    const startY = bounds.y;
    const startW = bounds.width;
    const startH = bounds.height;
    let effectiveScale = usesAbsoluteCompositionSpace(clipMeta) ? 1 : (trackScaleMap[clipMeta.track] ?? 1);

    if (needsInitialization) {
      effectiveScale = 1;
      onOverlayChange(actionId, { x: startX, y: startY, width: startW, height: startH });
    }

    dragState.current = {
      mode,
      actionId,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX,
      startY,
      startW,
      startH,
      effectiveScale,
    };
    onSelectClip(actionId);
  }, [editingClipId, getClipBounds, meta, onOverlayChange, onSelectClip, trackScaleMap]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const state = dragState.current;
      const currentLayout = layoutRef.current;
      if (!state || !currentLayout) {
        return;
      }

      const clipMeta = meta[state.actionId];
      if (!clipMeta) {
        return;
      }

      const projection = getTrackProjection(currentLayout, state.effectiveScale);
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
  }, [getTrackProjection, meta, onOverlayChange]);

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
    <div
      className="pointer-events-none absolute z-10"
      style={{ ...containerStyle, pointerEvents: "none" }}
    >
      {activeOverlays.map((overlay) => {
        const isSelected = selectedClipId === overlay.actionId;
        const clipMeta = meta[overlay.actionId];
        const trackScale = trackScaleMap[overlay.track] ?? 1;
        const effectiveScale = usesAbsoluteCompositionSpace(clipMeta) ? 1 : trackScale;
        const projection = getTrackProjection(layout, effectiveScale);
        const isEditing = editingClipId === overlay.actionId;
        const textStyle: CSSProperties | null = clipMeta?.clipType === "text"
          ? {
            color: clipMeta.text?.color ?? "#ffffff",
            fontFamily: clipMeta.text?.fontFamily ?? "Georgia, serif",
            fontSize: Math.max((clipMeta.text?.fontSize ?? 64) * projection.scaleX, 12),
            fontWeight: clipMeta.text?.bold ? 700 : 400,
            fontStyle: clipMeta.text?.italic ? "italic" : "normal",
            textAlign: clipMeta.text?.align ?? "center",
            lineHeight: 1.1,
            opacity: clipMeta.opacity ?? 1,
            textShadow: "0 2px 18px rgba(0, 0, 0, 0.35)",
          }
          : null;
        const style: CSSProperties = {
          left: projection.offsetX + overlay.x * projection.scaleX,
          top: projection.offsetY + overlay.y * projection.scaleY,
          width: overlay.width * projection.scaleX,
          height: overlay.height * projection.scaleY,
        };

        return (
          <div
            key={overlay.actionId}
            data-overlay-hit="true"
            className={`pointer-events-auto absolute border ${isSelected ? "border-editor-blue bg-editor-blue/10 shadow-[0_0_0_1px_rgba(137,180,250,0.4)]" : "border-white/45 bg-white/5"} cursor-move rounded-md`}
            style={style}
            onMouseDown={(event) => onMouseDown(event, overlay.actionId, "move")}
            onDoubleClick={(event) => {
              if (clipMeta?.clipType !== "text") {
                return;
              }

              event.stopPropagation();
              onSelectClip(overlay.actionId);
              setEditingClipId(overlay.actionId);
              setEditText(clipMeta.text?.content ?? "");
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelectClip(overlay.actionId);
            }}
          >
            <span className="pointer-events-none absolute -top-6 left-0 rounded-md bg-black/70 px-2 py-0.5 text-[10px] text-white">{overlay.label}</span>
            {isEditing && textStyle ? (
              <textarea
                ref={editorRef}
                data-inline-text-editor="true"
                className="absolute inset-0 h-full w-full resize-none overflow-hidden rounded-md border-0 p-0 focus:outline-none"
                style={{ ...textStyle, background: clipMeta?.text?.backgroundColor || "rgba(0,0,0,0.85)" }}
                value={editText}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setEditText(nextValue);
                  onOverlayChange(overlay.actionId, {
                    text: {
                      ...(clipMeta?.text ?? { content: "" }),
                      content: nextValue,
                    },
                  });
                }}
                onBlur={() => {
                  setEditingClipId(null);
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setEditingClipId(null);
                  }
                }}
              />
            ) : null}
            {isSelected ? (
              <>
                <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full border border-editor-blue bg-editor-base" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-nw")} />
                <div className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-editor-blue bg-editor-base" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-ne")} />
                <div className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full border border-editor-blue bg-editor-base" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-sw")} />
                <div className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full border border-editor-blue bg-editor-base" onMouseDown={(event) => onMouseDown(event, overlay.actionId, "resize-se")} />
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
