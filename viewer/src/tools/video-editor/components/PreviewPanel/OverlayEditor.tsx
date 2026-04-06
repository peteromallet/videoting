import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type OverlayBounds = Pick<ActiveOverlay, "x" | "y" | "width" | "height">;
type ActiveClipEntry = {
  actionId: string;
  track: string;
};

const MIN_CLIP_SIZE = 20;

const hasPositionOverride = (clipMeta: ClipMeta | undefined): boolean => {
  return Boolean(clipMeta && (clipMeta.x !== undefined || clipMeta.y !== undefined || clipMeta.width !== undefined || clipMeta.height !== undefined));
};

const usesAbsoluteCompositionSpace = (clipMeta: ClipMeta | undefined): boolean => {
  return Boolean(clipMeta && (clipMeta.clipType === "text" || hasPositionOverride(clipMeta)));
};

function OverlayEditorComponent({
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
  const [dragOverride, setDragOverride] = useState<{ actionId: string; bounds: OverlayBounds } | null>(null);
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
    latestBounds: OverlayBounds;
    hasChanges: boolean;
  } | null>(null);
  const layoutRef = useRef<OverlayLayout | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const textCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextCommitRef = useRef<{ actionId: string; value: string } | null>(null);

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

  const activeClipEntries = useMemo<ActiveClipEntry[]>(() => {
    const entries: ActiveClipEntry[] = [];
    for (const row of rows) {
      if (!row.id.startsWith("V")) {
        continue;
      }

      for (const action of row.actions) {
        if (currentTime >= action.start && currentTime < action.end) {
          entries.push({ actionId: action.id, track: row.id });
        }
      }
    }

    return entries;
  }, [currentTime, rows]);

  const activeOverlays = useMemo(() => {
    const overlays: ActiveOverlay[] = [];
    for (const { actionId, track } of activeClipEntries) {
      const clipMeta = meta[actionId];
      if (!clipMeta || clipMeta.track !== track) {
        continue;
      }

      const isSelected = selectedClipId === actionId;
      const isPositioned = usesAbsoluteCompositionSpace(clipMeta);
      if (!isPositioned && !isSelected) {
        continue;
      }

      const bounds = getClipBounds(clipMeta, track);
      overlays.push({
        actionId,
        label: clipMeta.asset ?? clipMeta.text?.content ?? actionId,
        track,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
    }

    return overlays;
  }, [activeClipEntries, getClipBounds, meta, selectedClipId]);

  const effectiveOverlays = useMemo(() => {
    if (!dragOverride) {
      return activeOverlays;
    }

    return activeOverlays.map((overlay) => {
      if (overlay.actionId !== dragOverride.actionId) {
        return overlay;
      }

      return {
        ...overlay,
        ...dragOverride.bounds,
      };
    });
  }, [activeOverlays, dragOverride]);

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

  const flushPendingTextCommit = useCallback(() => {
    if (textCommitTimerRef.current) {
      window.clearTimeout(textCommitTimerRef.current);
      textCommitTimerRef.current = null;
    }

    const pendingCommit = pendingTextCommitRef.current;
    if (!pendingCommit) {
      return;
    }

    const clipMeta = meta[pendingCommit.actionId];
    if (!clipMeta || clipMeta.text?.content === pendingCommit.value) {
      pendingTextCommitRef.current = null;
      return;
    }

    onOverlayChange(pendingCommit.actionId, {
      text: {
        ...(clipMeta.text ?? { content: "" }),
        content: pendingCommit.value,
      },
    });
    pendingTextCommitRef.current = null;
  }, [meta, onOverlayChange]);

  const closeInlineEditor = useCallback(() => {
    flushPendingTextCommit();
    setEditingClipId(null);
  }, [flushPendingTextCommit]);

  const commitDragChange = useCallback(() => {
    const state = dragState.current;
    dragState.current = null;
    setDragOverride(null);

    if (!state || !state.hasChanges) {
      return;
    }

    onOverlayChange(state.actionId, {
      x: state.latestBounds.x,
      y: state.latestBounds.y,
      width: state.latestBounds.width,
      height: state.latestBounds.height,
    });
  }, [onOverlayChange]);

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
    if (!editingClipId || selectedClipId === editingClipId) {
      return;
    }

    const clearEditor = window.setTimeout(() => {
      closeInlineEditor();
      setEditText("");
    }, 0);

    return () => {
      window.clearTimeout(clearEditor);
    };
  }, [closeInlineEditor, editingClipId, selectedClipId]);

  useEffect(() => {
    if (!editingClipId) {
      return;
    }

    const clipMeta = meta[editingClipId];
    if (clipMeta?.clipType === "text" && effectiveOverlays.some((overlay) => overlay.actionId === editingClipId)) {
      return;
    }

    const clearEditor = window.setTimeout(() => {
      closeInlineEditor();
      setEditText("");
    }, 0);

    return () => {
      window.clearTimeout(clearEditor);
    };
  }, [closeInlineEditor, editingClipId, effectiveOverlays, meta]);

  useEffect(() => {
    if (!editingClipId) {
      return;
    }

    editorRef.current?.focus();
    const cursorPosition = editorRef.current?.value.length ?? 0;
    editorRef.current?.setSelectionRange(cursorPosition, cursorPosition);
  }, [editingClipId]);

  useEffect(() => {
    if (!editingClipId) {
      pendingTextCommitRef.current = null;
      if (textCommitTimerRef.current) {
        window.clearTimeout(textCommitTimerRef.current);
        textCommitTimerRef.current = null;
      }
      return;
    }

    const clipMeta = meta[editingClipId];
    if (clipMeta?.clipType !== "text" || clipMeta.text?.content === editText) {
      pendingTextCommitRef.current = null;
      return;
    }

    pendingTextCommitRef.current = { actionId: editingClipId, value: editText };
    if (textCommitTimerRef.current) {
      window.clearTimeout(textCommitTimerRef.current);
    }
    textCommitTimerRef.current = window.setTimeout(() => {
      flushPendingTextCommit();
    }, 300);
  }, [editText, editingClipId, flushPendingTextCommit, meta]);

  useEffect(() => {
    return () => {
      if (textCommitTimerRef.current) {
        window.clearTimeout(textCommitTimerRef.current);
      }
    };
  }, []);

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

    const bounds = getClipBounds(clipMeta, clipMeta.track);
    const effectiveScale = usesAbsoluteCompositionSpace(clipMeta) ? 1 : (trackScaleMap[clipMeta.track] ?? 1);
    const latestBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };

    dragState.current = {
      mode,
      actionId,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX: bounds.x,
      startY: bounds.y,
      startW: bounds.width,
      startH: bounds.height,
      effectiveScale,
      latestBounds,
      hasChanges: false,
    };
    setDragOverride({ actionId, bounds: latestBounds });
    onSelectClip(actionId);
  }, [editingClipId, getClipBounds, meta, onSelectClip, trackScaleMap]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const state = dragState.current;
      const currentLayout = layoutRef.current;
      if (!state || !currentLayout) {
        return;
      }

      const projection = getTrackProjection(currentLayout, state.effectiveScale);
      const dx = (event.clientX - state.startMouseX) / projection.scaleX;
      const dy = (event.clientY - state.startMouseY) / projection.scaleY;

      let nextX = state.startX;
      let nextY = state.startY;
      let nextWidth = state.startW;
      let nextHeight = state.startH;

      if (state.mode === "move") {
        nextX = state.startX + dx;
        nextY = state.startY + dy;
      } else if (state.mode === "resize-se") {
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

      const nextBounds = {
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
      };
      state.latestBounds = nextBounds;
      state.hasChanges = (
        nextBounds.x !== state.startX
        || nextBounds.y !== state.startY
        || nextBounds.width !== state.startW
        || nextBounds.height !== state.startH
      );
      setDragOverride({ actionId: state.actionId, bounds: nextBounds });
    };

    const onMouseUp = () => {
      commitDragChange();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [commitDragChange, getTrackProjection]);

  if (effectiveOverlays.length === 0 || !layout) {
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
      {effectiveOverlays.map((overlay) => {
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
              flushPendingTextCommit();
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
                className="absolute inset-0 flex h-full w-full resize-none items-center overflow-hidden rounded-md border-0 p-0 focus:outline-none"
                style={{
                  ...textStyle,
                  background: "rgba(0,0,0,0.85)",
                  display: "flex",
                  alignItems: "center",
                  whiteSpace: "pre-wrap",
                  paddingTop: `${Math.max(0, ((overlay.height * projection.scaleY) - (textStyle.fontSize as number) * 1.1) / 2)}px`,
                }}
                value={editText}
                onChange={(event) => {
                  setEditText(event.currentTarget.value);
                }}
                onBlur={() => {
                  closeInlineEditor();
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeInlineEditor();
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

const MemoizedOverlayEditor = memo(OverlayEditorComponent);

export default function OverlayEditor(props: Props) {
  return <MemoizedOverlayEditor {...props} />;
}
