import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { TimelineAction, TimelineRow } from "@xzdarcy/timeline-engine";
import {
  getVisualTracks,
  splitClipAtPlayhead,
  toggleClipMute,
  updateClipInConfig,
} from "@shared/editor-utils";
import type { ClipType, TrackKind } from "@shared/types";
import {
  buildRowTrackPatches,
  getCompatibleTrackId,
  rawRowIndexFromY,
  ROW_HEIGHT,
  TIMELINE_START_LEFT,
  updateClipOrder,
} from "@/tools/video-editor/lib/coordinate-utils";
import {
  getNextClipId,
  getSourceTime,
  inferTrackType,
  type ClipMeta,
  type TimelineData,
} from "@/tools/video-editor/lib/timeline-data";
import type { ActionDragState, UseTimelineDataResult } from "./useTimelineData";

export interface UseTimelineEditingArgs {
  dataRef: React.MutableRefObject<TimelineData | null>;
  resolvedConfig: TimelineData["resolvedConfig"] | null;
  data: TimelineData | null;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selectedTrack: UseTimelineDataResult["selectedTrack"];
  currentTime: number;
  scale: number;
  scaleWidth: number;
  crossTrackActive: React.MutableRefObject<boolean>;
  actionDragStateRef: React.MutableRefObject<Record<string, ActionDragState>>;
  resizeStartRef: React.MutableRefObject<Record<string, { start: number; from: number }>>;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  applyTimelineEdit: UseTimelineDataResult["applyTimelineEdit"];
  applyResolvedConfigEdit: UseTimelineDataResult["applyResolvedConfigEdit"];
  patchRegistry: UseTimelineDataResult["patchRegistry"];
  uploadAsset: UseTimelineDataResult["uploadAsset"];
  invalidateAssetRegistry: UseTimelineDataResult["invalidateAssetRegistry"];
}

export interface UseTimelineEditingResult {
  onActionMoveStart: ({ action, row }: { action: TimelineAction; row: TimelineRow }) => void;
  onActionMoving: ({ action, row, start, end }: { action: TimelineAction; row: TimelineRow; start: number; end: number }) => boolean | undefined;
  onActionMoveEnd: ({ action }: { action: TimelineAction; row: TimelineRow; start: number; end: number }) => void;
  onActionResizeStart: ({ action }: { action: TimelineAction }) => void;
  onActionResizeEnd: ({ action, row }: { action: TimelineAction; row: TimelineRow; dir: string }) => void;
  onChange: (nextRows: TimelineRow[]) => boolean | undefined;
  onOverlayChange: (actionId: string, patch: Partial<ClipMeta>) => void;
  onTimelineDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleAssetDrop: (assetKey: string, trackId: string | undefined, time: number) => void;
  handleDeleteClip: (clipId: string) => void;
  handleSelectedClipChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  handleResetClipPosition: () => void;
  handleSplitSelectedClip: () => void;
  handleToggleMute: () => void;
  handleAddText: () => void;
  clearActionDragState: (clipId: string) => void;
}

export function useTimelineEditing({
  dataRef,
  resolvedConfig,
  data,
  selectedClipId,
  selectedTrackId,
  selectedTrack,
  currentTime,
  scale,
  scaleWidth,
  crossTrackActive,
  actionDragStateRef,
  resizeStartRef,
  setSelectedClipId,
  setSelectedTrackId,
  applyTimelineEdit,
  applyResolvedConfigEdit,
  patchRegistry,
  uploadAsset,
  invalidateAssetRegistry,
}: UseTimelineEditingArgs): UseTimelineEditingResult {
  const currentTimeRef = useRef(currentTime);
  const timelineDomCacheRef = useRef<{
    wrapper: HTMLDivElement | null;
    editArea: HTMLElement | null;
    grid: HTMLElement | null;
  }>({
    wrapper: null,
    editArea: null,
    grid: null,
  });
  const dragPreviewFrameRef = useRef<number | null>(null);
  const latestDragPreviewRef = useRef<{
    wrapper: HTMLDivElement;
    time: number;
    rowRect: { top: number; height: number };
    trackName: string;
    wrapperRect: DOMRect;
    pixelsPerSecond: number;
  } | null>(null);
  const dropIndicatorRef = useRef<{
    root: HTMLDivElement;
    row: HTMLDivElement;
    line: HTMLDivElement;
    ghost: HTMLDivElement;
    ghostLabel: HTMLSpanElement;
    label: HTMLDivElement;
  } | null>(null);

  useLayoutEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const getTimelineDomNodes = useCallback((wrapper: HTMLDivElement) => {
    const cached = timelineDomCacheRef.current;
    if (
      cached.wrapper !== wrapper
      || !cached.editArea?.isConnected
      || !cached.grid?.isConnected
    ) {
      const editArea = wrapper.querySelector<HTMLElement>(".timeline-editor-edit-area");
      const grid = editArea?.querySelector<HTMLElement>(".ReactVirtualized__Grid")
        ?? wrapper.querySelector<HTMLElement>(".ReactVirtualized__Grid");
      timelineDomCacheRef.current = { wrapper, editArea, grid };
      return timelineDomCacheRef.current;
    }

    return cached;
  }, []);

  const ensureDropIndicator = useCallback(() => {
    if (dropIndicatorRef.current) {
      return dropIndicatorRef.current;
    }

    const root = document.createElement("div");
    root.dataset.dropIndicator = "true";
    root.style.position = "fixed";
    root.style.top = "0";
    root.style.left = "0";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.pointerEvents = "none";
    root.style.zIndex = "99999";

    const row = document.createElement("div");
    row.style.position = "fixed";
    row.style.background = "rgba(137,180,250,0.08)";
    row.style.border = "1px solid rgba(137,180,250,0.3)";
    row.style.borderRadius = "4px";
    row.style.pointerEvents = "none";

    const line = document.createElement("div");
    line.style.position = "fixed";
    line.style.width = "2px";
    line.style.background = "#89b4fa";
    line.style.pointerEvents = "none";
    line.style.boxShadow = "0 0 6px rgba(137,180,250,0.5)";

    const ghost = document.createElement("div");
    ghost.style.position = "fixed";
    ghost.style.background = "rgba(137,180,250,0.15)";
    ghost.style.border = "1px dashed rgba(137,180,250,0.4)";
    ghost.style.borderRadius = "4px";
    ghost.style.pointerEvents = "none";
    ghost.style.display = "flex";
    ghost.style.alignItems = "center";
    ghost.style.justifyContent = "center";

    const ghostLabel = document.createElement("span");
    ghostLabel.style.fontSize = "9px";
    ghostLabel.style.fontWeight = "600";
    ghostLabel.style.color = "rgba(137,180,250,0.9)";
    ghost.appendChild(ghostLabel);

    const label = document.createElement("div");
    label.style.position = "fixed";
    label.style.background = "rgba(137,180,250,0.9)";
    label.style.color = "#1e1e2e";
    label.style.fontSize = "9px";
    label.style.fontWeight = "600";
    label.style.padding = "2px 6px";
    label.style.borderRadius = "3px";
    label.style.pointerEvents = "none";
    label.style.whiteSpace = "nowrap";

    root.appendChild(row);
    root.appendChild(line);
    root.appendChild(ghost);
    root.appendChild(label);
    document.body.appendChild(root);

    dropIndicatorRef.current = { root, row, line, ghost, ghostLabel, label };
    return dropIndicatorRef.current;
  }, []);

  const clearDropIndicator = useCallback(() => {
    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
      dragPreviewFrameRef.current = null;
    }
    latestDragPreviewRef.current = null;
    dropIndicatorRef.current?.root.remove();
    dropIndicatorRef.current = null;
  }, []);

  // Shared drop position calculation — used by indicator, file drop, and asset drop
  const getDropPosition = useCallback((wrapper: HTMLDivElement, clientX: number, clientY: number) => {
    const { editArea, grid } = getTimelineDomNodes(wrapper);
    const rect = (editArea ?? wrapper).getBoundingClientRect();
    const scrollLeft = grid?.scrollLeft ?? 0;
    const scrollTop = grid?.scrollTop ?? 0;
    const pixelsPerSecond = scaleWidth / scale;
    const defaultClipDuration = 5;
    const halfClipPx = (defaultClipDuration * pixelsPerSecond) / 2;
    const dropX = clientX - rect.left;
    const time = Math.max(0, (dropX + scrollLeft - TIMELINE_START_LEFT - halfClipPx) / pixelsPerSecond);

    // Calculate row index from Y position relative to the edit area
    // Use editArea rect for Y (matches upstream library and cross-track drag)
    // Use grid for scrollTop (grid owns scroll state)
    const editAreaRect = (editArea ?? wrapper).getBoundingClientRect();
    const rowCount = dataRef.current?.rows.length ?? 0;
    const raw = rawRowIndexFromY(clientY, editAreaRect.top, scrollTop, ROW_HEIGHT);
    const rowIndex = Math.min(raw, rowCount - 1);

    // Get the actual row rect for the indicator
    const rowScreenTop = editAreaRect.top + rowIndex * ROW_HEIGHT - scrollTop;
    const rowRect = { top: rowScreenTop, height: ROW_HEIGHT, left: editAreaRect.left, width: editAreaRect.width } as DOMRect;

    const trackId = rowIndex >= 0 ? dataRef.current?.rows[rowIndex]?.id : undefined;
    const trackName = dataRef.current?.tracks[rowIndex]?.label ?? dataRef.current?.tracks[rowIndex]?.id ?? "";

    return { time, rowIndex, rowRect, trackId, trackName, pixelsPerSecond, wrapperRect: wrapper.getBoundingClientRect() };
  }, [dataRef, getTimelineDomNodes, scale, scaleWidth]);

  useEffect(() => {
    return () => {
      clearDropIndicator();
    };
  }, [clearDropIndicator]);

  const clearActionDragState = useCallback((clipId: string) => {
    delete actionDragStateRef.current[clipId];
  }, [actionDragStateRef]);

  const onActionMoveStart = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow }) => {
    if (action.id.startsWith("uploading-")) return;
    actionDragStateRef.current[action.id] = {
      rowId: row.id,
      initialStart: action.start,
      initialEnd: action.end,
      latestStart: action.start,
      latestEnd: action.end,
    };
  }, [actionDragStateRef]);

  const onActionMoving = useCallback(({ action, row, start, end }: {
    action: TimelineAction;
    row: TimelineRow;
    start: number;
    end: number;
  }) => {
    if (action.id.startsWith("uploading-")) return false;
    actionDragStateRef.current[action.id] = {
      rowId: row.id,
      initialStart: actionDragStateRef.current[action.id]?.initialStart ?? action.start,
      initialEnd: actionDragStateRef.current[action.id]?.initialEnd ?? action.end,
      latestStart: start,
      latestEnd: end,
    };

    if (crossTrackActive.current) {
      return false;
    }

    return undefined;
  }, [actionDragStateRef, crossTrackActive]);

  const onActionMoveEnd = useCallback(({ action }: { action: TimelineAction; row: TimelineRow; start: number; end: number }) => {
    if (!crossTrackActive.current) {
      clearActionDragState(action.id);
    }
  }, [clearActionDragState, crossTrackActive]);

  const onActionResizeStart = useCallback(({ action }: { action: TimelineAction }) => {
    if (action.id.startsWith("uploading-")) return;
    const clipMeta = dataRef.current?.meta[action.id];
    if (!clipMeta || typeof clipMeta.hold === "number") {
      return;
    }

    resizeStartRef.current[action.id] = {
      start: action.start,
      from: clipMeta.from ?? 0,
    };
  }, [dataRef, resizeStartRef]);

  const onActionResizeEnd = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow; dir: string }) => {
    if (action.id.startsWith("uploading-")) return;
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!current || !clipMeta) {
      return;
    }

    const metaUpdates: Record<string, Partial<ClipMeta>> = {
      ...buildRowTrackPatches(current.rows),
      [action.id]: {
        track: row.id,
      },
    };

    if (typeof clipMeta.hold !== "number") {
      const origin = resizeStartRef.current[action.id];
      if (origin && action.start !== origin.start) {
        metaUpdates[action.id] = {
          ...metaUpdates[action.id],
          from: Math.max(0, origin.from + (action.start - origin.start) * (clipMeta.speed ?? 1)),
        };
      }

      metaUpdates[action.id] = {
        ...metaUpdates[action.id],
        to: getSourceTime(
          {
            from: clipMeta.from ?? 0,
            start: action.start,
            speed: clipMeta.speed ?? 1,
          },
          action.end,
        ),
      };
    }

    const nextRows = current.rows.map((entry) => {
      if (entry.id !== row.id) {
        return entry;
      }

      return {
        ...entry,
        actions: entry.actions.map((candidate) => {
          return candidate.id === action.id
            ? { ...candidate, start: action.start, end: action.end }
            : candidate;
        }),
      };
    });

    applyTimelineEdit(nextRows, metaUpdates);
    delete resizeStartRef.current[action.id];
  }, [applyTimelineEdit, dataRef, resizeStartRef]);

  const onChange = useCallback((nextRows: TimelineRow[]) => {
    if (crossTrackActive.current) {
      return false;
    }

    applyTimelineEdit(nextRows, buildRowTrackPatches(nextRows));
    return undefined;
  }, [applyTimelineEdit, crossTrackActive]);

  const onOverlayChange = useCallback((actionId: string, patch: Partial<ClipMeta>) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    applyTimelineEdit(current.rows, { [actionId]: patch });
  }, [applyTimelineEdit, dataRef]);

  const handleAssetDrop = useCallback((assetKey: string, trackId: string | undefined, time: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const assetEntry = current.registry.assets[assetKey];
    const assetKind = inferTrackType(assetEntry?.file ?? assetKey);
    const resolvedTrackId = getCompatibleTrackId(current.tracks, trackId, assetKind, selectedTrackId);
    if (!resolvedTrackId) {
      return;
    }

    const track = current.tracks.find((candidate) => candidate.id === resolvedTrackId);
    if (!track) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const isImage = assetEntry?.type?.startsWith("image");
    const isManual = track.fit === "manual";
    const clipType: ClipType = isImage ? "hold" : "media";
    const baseDuration = Math.max(1, Math.min(assetEntry?.duration ?? 5, assetKind === "audio" ? assetEntry?.duration ?? 10 : 5));

    let clipMeta: ClipMeta;
    let duration: number;

    if (track.kind === "audio") {
      duration = assetEntry?.duration ?? 10;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType: "media",
        from: 0,
        to: duration,
        speed: 1,
        volume: 1,
      };
    } else if (isImage) {
      duration = 5;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType,
        hold: duration,
        opacity: 1,
        x: isManual ? 100 : undefined,
        y: isManual ? 100 : undefined,
        width: isManual ? 320 : undefined,
        height: isManual ? 240 : undefined,
      };
    } else {
      duration = baseDuration;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType,
        from: 0,
        to: duration,
        speed: 1,
        volume: 1,
        opacity: 1,
        x: isManual ? 100 : undefined,
        y: isManual ? 100 : undefined,
        width: isManual ? 320 : undefined,
        height: isManual ? 240 : undefined,
      };
    }

    const action: TimelineAction = {
      id: clipId,
      start: time,
      end: time + duration,
      effectId: `effect-${clipId}`,
    };

    const nextRows = current.rows.map((row) => (row.id === resolvedTrackId ? { ...row, actions: [...row.actions, action] } : row));
    const nextClipOrder = updateClipOrder(current.clipOrder, resolvedTrackId, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, { [clipId]: clipMeta }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(resolvedTrackId);
  }, [applyTimelineEdit, dataRef, selectedTrackId, setSelectedClipId, setSelectedTrackId]);

  const onTimelineDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer.types);
    if (!types.includes("asset-key") && !types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const wrapper = event.currentTarget;
    wrapper.dataset.dragOver = "true";

    const preview = getDropPosition(wrapper, event.clientX, event.clientY);
    latestDragPreviewRef.current = {
      wrapper,
      time: preview.time,
      rowRect: {
        top: preview.rowRect?.top ?? preview.wrapperRect.top,
        height: preview.rowRect?.height ?? 36,
      },
      trackName: preview.trackName,
      wrapperRect: preview.wrapperRect,
      pixelsPerSecond: preview.pixelsPerSecond,
    };

    if (dragPreviewFrameRef.current !== null) {
      return;
    }

    dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
      dragPreviewFrameRef.current = null;
      const currentPreview = latestDragPreviewRef.current;
      if (!currentPreview) {
        return;
      }

      const { editArea, grid } = getTimelineDomNodes(currentPreview.wrapper);
      const indicator = ensureDropIndicator();
      const editRect = (editArea ?? currentPreview.wrapper).getBoundingClientRect();
      const scrollLeft = grid?.scrollLeft ?? 0;
      const clipScreenLeft = editRect.left + TIMELINE_START_LEFT + currentPreview.time * currentPreview.pixelsPerSecond - scrollLeft;
      const defaultDur = 5;
      const ghostWidth = Math.max(0, Math.min(defaultDur * currentPreview.pixelsPerSecond, currentPreview.wrapperRect.right - clipScreenLeft));
      const ghostCenter = clipScreenLeft + ghostWidth / 2;

      indicator.row.style.left = `${currentPreview.wrapperRect.left}px`;
      indicator.row.style.top = `${currentPreview.rowRect.top}px`;
      indicator.row.style.width = `${currentPreview.wrapperRect.width}px`;
      indicator.row.style.height = `${currentPreview.rowRect.height}px`;

      indicator.line.style.left = `${ghostCenter}px`;
      indicator.line.style.top = `${currentPreview.rowRect.top}px`;
      indicator.line.style.height = `${currentPreview.rowRect.height}px`;

      indicator.ghost.style.left = `${clipScreenLeft}px`;
      indicator.ghost.style.top = `${currentPreview.rowRect.top + 2}px`;
      indicator.ghost.style.width = `${ghostWidth}px`;
      indicator.ghost.style.height = `${Math.max(0, currentPreview.rowRect.height - 4)}px`;
      indicator.ghostLabel.textContent = `${currentPreview.time.toFixed(1)}s`;

      indicator.label.style.left = `${ghostCenter - 30}px`;
      indicator.label.style.top = `${currentPreview.rowRect.top - 16}px`;
      indicator.label.textContent = `${currentPreview.trackName} · ${currentPreview.time.toFixed(1)}s`;
    });
  }, [ensureDropIndicator, getDropPosition, getTimelineDomNodes]);

  const onTimelineDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    delete event.currentTarget.dataset.dragOver;
    clearDropIndicator();
  }, [clearDropIndicator]);

  const onTimelineDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    delete event.currentTarget.dataset.dragOver;
    clearDropIndicator();

    // Handle external file drops
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0 && dataRef.current) {
      const { time, rowIndex } = getDropPosition(event.currentTarget, event.clientX, event.clientY);

      const defaultClipDuration = 5; // seconds — used for offset calculation
      let timeOffset = 0;

      for (const file of files) {
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        const kind: TrackKind = [".mp3", ".wav", ".aac", ".m4a"].includes(ext) ? "audio" : "visual";
        const targetTrackId = rowIndex >= 0 ? dataRef.current!.rows[rowIndex]?.id : undefined;
        const compatibleTrackId = getCompatibleTrackId(dataRef.current!.tracks, targetTrackId, kind, selectedTrackId);
        if (!compatibleTrackId) {
          continue;
        }

        const clipTime = time + timeOffset;
        timeOffset += defaultClipDuration;

        // Insert skeleton clip
        const skeletonId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const skeletonMeta: ClipMeta = {
          asset: `uploading:${file.name}`,
          track: compatibleTrackId,
          clipType: kind === "audio" ? "media" : "hold",
          hold: kind === "audio" ? undefined : defaultClipDuration,
          from: kind === "audio" ? 0 : undefined,
          to: kind === "audio" ? defaultClipDuration : undefined,
        };
        const skeletonAction: TimelineAction = {
          id: skeletonId,
          start: clipTime,
          end: clipTime + defaultClipDuration,
          effectId: `effect-${skeletonId}`,
        };

        const nextRows = dataRef.current!.rows.map(row =>
          row.id === compatibleTrackId
            ? { ...row, actions: [...row.actions, skeletonAction] }
            : row
        );
        applyTimelineEdit(nextRows, { [skeletonId]: skeletonMeta }, undefined, undefined, { save: false });

        void (async () => {
          try {
            const result = await uploadAsset(file);
            patchRegistry(result.assetId, result.entry);
            // Remove skeleton
            const current = dataRef.current!;
            const cleanRows = current.rows.map(row => ({
              ...row,
              actions: row.actions.filter(a => a.id !== skeletonId),
            }));
            applyTimelineEdit(cleanRows, undefined, [skeletonId]);
            // Insert real clip at original drop position
            handleAssetDrop(result.assetId, compatibleTrackId, clipTime);
            void invalidateAssetRegistry();
          } catch (error) {
            console.error("[drop] Upload failed:", error);
            // Remove skeleton on failure
            const current = dataRef.current!;
            const cleanRows = current.rows.map(row => ({
              ...row,
              actions: row.actions.filter(a => a.id !== skeletonId),
            }));
            applyTimelineEdit(cleanRows, undefined, [skeletonId], undefined, { save: false });
          }
        })();
      }
      return;
    }

    // Handle internal asset drag from AssetPanel
    const assetKey = event.dataTransfer.getData("asset-key");
    const assetKind = event.dataTransfer.getData("asset-kind") as TrackKind;
    if (!assetKey || !dataRef.current) {
      return;
    }

    const { time, rowIndex } = getDropPosition(event.currentTarget, event.clientX, event.clientY);
    const targetTrackId = rowIndex >= 0 ? dataRef.current!.rows[rowIndex]?.id : undefined;
    const compatibleTrackId = getCompatibleTrackId(dataRef.current!.tracks, targetTrackId, assetKind || "visual", selectedTrackId);
    if (!compatibleTrackId) return;
    handleAssetDrop(assetKey, compatibleTrackId, time);
  }, [
    applyTimelineEdit,
    dataRef,
    handleAssetDrop,
    invalidateAssetRegistry,
    patchRegistry,
    clearDropIndicator,
    getDropPosition,
    selectedTrackId,
    uploadAsset,
  ]);

  const handleDeleteClip = useCallback((clipId: string) => {
    if (clipId.startsWith("uploading-")) return;
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const clipTrack = current.meta[clipId]?.track;
    const nextRows = current.rows.map((row) => ({
      ...row,
      actions: row.actions.filter((action) => action.id !== clipId),
    }));
    const nextClipOrder = clipTrack
      ? updateClipOrder(current.clipOrder, clipTrack, (ids) => ids.filter((id) => id !== clipId))
      : current.clipOrder;
    applyTimelineEdit(nextRows, undefined, [clipId], nextClipOrder);
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  }, [applyTimelineEdit, dataRef, selectedClipId, setSelectedClipId]);

  const handleSelectedClipChange = useCallback((patch: Partial<ClipMeta> & { at?: number }) => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    const nextResolvedConfig = updateClipInConfig(resolvedConfig, selectedClipId, (clip) => {
      return {
        ...clip,
        at: patch.at !== undefined ? Math.max(0, patch.at) : clip.at,
        clipType: patch.clipType ?? clip.clipType,
        from: patch.from !== undefined ? Math.max(0, patch.from) : clip.from,
        to: patch.to !== undefined ? Math.max(0, patch.to) : clip.to,
        speed: patch.speed !== undefined ? Math.min(4, Math.max(0.25, patch.speed)) : clip.speed,
        hold: patch.hold !== undefined ? Math.max(0.1, patch.hold) : clip.hold,
        volume: patch.volume !== undefined ? Math.min(1, Math.max(0, patch.volume)) : clip.volume,
        x: patch.x ?? clip.x,
        y: patch.y ?? clip.y,
        width: patch.width !== undefined ? Math.max(20, patch.width) : clip.width,
        height: patch.height !== undefined ? Math.max(20, patch.height) : clip.height,
        opacity: patch.opacity !== undefined ? Math.min(1, Math.max(0, patch.opacity)) : clip.opacity,
        text: patch.text !== undefined ? patch.text : clip.text,
        entrance: patch.entrance !== undefined ? patch.entrance : clip.entrance,
        exit: patch.exit !== undefined ? patch.exit : clip.exit,
        continuous: patch.continuous !== undefined ? patch.continuous : clip.continuous,
        transition: patch.transition !== undefined ? patch.transition : clip.transition,
      };
    });

    applyResolvedConfigEdit(nextResolvedConfig, { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleResetClipPosition = useCallback(() => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    const nextResolvedConfig = updateClipInConfig(resolvedConfig, selectedClipId, (clip) => ({
      ...clip,
      x: undefined,
      y: undefined,
      width: undefined,
      height: undefined,
    }));

    applyResolvedConfigEdit(nextResolvedConfig, { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleSplitSelectedClip = useCallback(() => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    const result = splitClipAtPlayhead(resolvedConfig, selectedClipId, currentTimeRef.current);
    if (result.nextSelectedClipId) {
      applyResolvedConfigEdit(result.config, { selectedClipId: result.nextSelectedClipId });
    }
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleToggleMute = useCallback(() => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    applyResolvedConfigEdit(toggleClipMute(resolvedConfig, selectedClipId), { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleAddText = useCallback(() => {
    if (!data) {
      return;
    }

    const visualTrack = selectedTrack?.kind === "visual"
      ? selectedTrack
      : getVisualTracks(data.resolvedConfig).slice(-1)[0];
    if (!visualTrack) {
      return;
    }

    const clipId = getNextClipId(data.meta);
    const duration = 4;
    const currentPlayhead = currentTimeRef.current;
    const action: TimelineAction = {
      id: clipId,
      start: currentPlayhead,
      end: currentPlayhead + duration,
      effectId: `effect-${clipId}`,
    };
    const nextRows = data.rows.map((row) => (row.id === visualTrack.id ? { ...row, actions: [...row.actions, action] } : row));
    const nextClipOrder = updateClipOrder(data.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);

    applyTimelineEdit(nextRows, {
      [clipId]: {
        track: visualTrack.id,
        clipType: "text",
        hold: duration,
        x: 180,
        y: 140,
        width: 920,
        height: 180,
        opacity: 1,
        text: {
          content: "New title",
          fontFamily: "Georgia, serif",
          fontSize: 64,
          color: "#ffffff",
          align: "center",
          bold: true,
          italic: false,
        },
      },
    }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(visualTrack.id);
  }, [applyTimelineEdit, data, selectedTrack, setSelectedClipId, setSelectedTrackId]);

  return {
    onActionMoveStart,
    onActionMoving,
    onActionMoveEnd,
    onActionResizeStart,
    onActionResizeEnd,
    onChange,
    onOverlayChange,
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
    handleAssetDrop,
    handleDeleteClip,
    handleSelectedClipChange,
    handleResetClipPosition,
    handleSplitSelectedClip,
    handleToggleMute,
    handleAddText,
    clearActionDragState,
  };
}
