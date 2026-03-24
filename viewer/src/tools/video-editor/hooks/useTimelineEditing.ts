import { useCallback } from "react";
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
  uploadFiles: (files: File[]) => Promise<void>;
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
  uploadFiles,
}: UseTimelineEditingArgs): UseTimelineEditingResult {
  const clearActionDragState = useCallback((clipId: string) => {
    delete actionDragStateRef.current[clipId];
  }, [actionDragStateRef]);

  const onActionMoveStart = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow }) => {
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
    event.currentTarget.dataset.dragOver = "true";

    // Show drop position indicator
    const wrapper = event.currentTarget;
    const wrapperRect = wrapper.getBoundingClientRect();
    const relX = event.clientX - wrapperRect.left;
    const relY = event.clientY - wrapperRect.top;

    // Find target row
    const rowElements = Array.from(wrapper.querySelectorAll<HTMLElement>(".timeline-editor-edit-row"));
    const targetRowIndex = rowElements.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return event.clientY >= r.top && event.clientY <= r.bottom;
    });
    const targetRow = rowElements[targetRowIndex];

    // Calculate time
    const grid = wrapper.querySelector<HTMLElement>(".ReactVirtualized__Grid");
    const scrollLeft = grid?.scrollLeft ?? 0;
    const pixelsPerSecond = scaleWidth / scale;
    const time = Math.max(0, (relX + scrollLeft - TIMELINE_START_LEFT) / pixelsPerSecond);

    // Get target row position for the highlight
    const rowRect = targetRow?.getBoundingClientRect();
    const rowTop = rowRect?.top ?? wrapperRect.top;
    const rowHeight = rowRect?.height ?? 36;
    const trackName = dataRef.current?.tracks[targetRowIndex]?.label ?? dataRef.current?.tracks[targetRowIndex]?.id ?? "";

    // Create or update the drop indicator (fixed on body)
    let indicator = document.querySelector<HTMLElement>("[data-drop-indicator]");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.dataset.dropIndicator = "true";
      document.body.appendChild(indicator);
    }

    // Show a highlighted row area + a clip ghost at the drop position
    const ghostWidth = 80;
    indicator.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;`;
    indicator.innerHTML = `
      <div style="position:fixed;left:${wrapperRect.left}px;top:${rowTop}px;width:${wrapperRect.width}px;height:${rowHeight}px;background:rgba(137,180,250,0.08);border:1px solid rgba(137,180,250,0.3);border-radius:4px;pointer-events:none;"></div>
      <div style="position:fixed;left:${event.clientX}px;top:${rowTop}px;width:2px;height:${rowHeight}px;background:#89b4fa;pointer-events:none;box-shadow:0 0 6px rgba(137,180,250,0.5);"></div>
      <div style="position:fixed;left:${event.clientX + 4}px;top:${rowTop + 4}px;width:${ghostWidth}px;height:${rowHeight - 8}px;background:rgba(137,180,250,0.18);border:1px dashed rgba(137,180,250,0.5);border-radius:4px;pointer-events:none;display:flex;align-items:center;justify-content:center;gap:4px;">
        <span style="font-size:9px;font-weight:600;color:rgba(137,180,250,0.9);">${time.toFixed(1)}s</span>
      </div>
      <div style="position:fixed;left:${event.clientX + 4}px;top:${rowTop - 18}px;background:rgba(137,180,250,0.9);color:#1e1e2e;font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;pointer-events:none;white-space:nowrap;">${trackName} · ${time.toFixed(1)}s</div>
    `;
  }, [scale, scaleWidth]);

  const onTimelineDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    delete event.currentTarget.dataset.dragOver;
    document.querySelector("[data-drop-indicator]")?.remove();
    document.querySelector("[data-drop-label]")?.remove();
    document.querySelector("[data-drop-indicator]")?.remove();
  }, []);

  const onTimelineDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    delete event.currentTarget.dataset.dragOver;
    document.querySelector("[data-drop-indicator]")?.remove();
    document.querySelector("[data-drop-label]")?.remove();
    document.querySelector("[data-drop-indicator]")?.remove();

    // Handle external file drops
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0 && dataRef.current) {
      const editArea = event.currentTarget.querySelector<HTMLElement>(".timeline-editor-edit-area");
      const grid = event.currentTarget.querySelector<HTMLElement>(".ReactVirtualized__Grid");
      const rect = (editArea ?? event.currentTarget).getBoundingClientRect();
      const scrollLeft = grid?.scrollLeft ?? event.currentTarget.scrollLeft;
      const pixelsPerSecond = scaleWidth / scale;
      const dropX = event.clientX - rect.left;
      const time = Math.max(0, (dropX + scrollLeft - TIMELINE_START_LEFT) / pixelsPerSecond);

      const rowElements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".timeline-editor-edit-row"));
      const rowIndex = rowElements.findIndex((rowElement) => {
        const rowRect = rowElement.getBoundingClientRect();
        return event.clientY >= rowRect.top && event.clientY <= rowRect.bottom;
      });

      // Add skeleton placeholder clips immediately
      const skeletonIds: string[] = [];
      for (const file of files) {
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        const kind: TrackKind = [".mp3", ".wav", ".aac", ".m4a"].includes(ext) ? "audio" : "visual";
        const targetTrackId = rowIndex >= 0 ? dataRef.current!.rows[rowIndex]?.id : undefined;
        const compatibleTrackId = getCompatibleTrackId(dataRef.current!.tracks, targetTrackId, kind, selectedTrackId);
        const skeletonId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        skeletonIds.push(skeletonId);

        const targetRow = compatibleTrackId ?? dataRef.current!.rows[0]?.id;
        if (targetRow) {
          const placeholderMeta: ClipMeta = {
            asset: `uploading:${file.name}`,
            track: targetRow,
            clipType: "hold",
            hold: 3,
          };
          const nextRows = dataRef.current!.rows.map((row) => {
            if (row.id !== targetRow) return row;
            return {
              ...row,
              actions: [...row.actions, { id: skeletonId, start: time, end: time + 3, effectId: "" }],
            };
          });
          applyTimelineEdit(nextRows, { [skeletonId]: placeholderMeta }, undefined, undefined);
        }
      }

      // Upload files
      console.log("[drop] Uploading", files.length, "file(s)...");
      await uploadFiles(files);
      console.log("[drop] Upload complete, waiting for registry refresh...");
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Remove skeletons and add real clips
      const current = dataRef.current;
      if (current) {
        // Remove skeleton actions
        const cleanedRows = current.rows.map((row) => ({
          ...row,
          actions: row.actions.filter((a) => !skeletonIds.includes(a.id)),
        }));
        const metaDeletes = skeletonIds;

        // Add real clips
        applyTimelineEdit(cleanedRows, {}, metaDeletes, undefined);

        for (const file of files) {
          const assetKey = file.name.replace(/\.[^.]+$/, "").replace(/\s+/g, "-").toLowerCase();
          const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
          const kind: TrackKind = [".mp3", ".wav", ".aac", ".m4a"].includes(ext) ? "audio" : "visual";
          const targetTrackId = rowIndex >= 0 ? dataRef.current!.rows[rowIndex]?.id : undefined;
          const compatibleTrackId = getCompatibleTrackId(dataRef.current!.tracks, targetTrackId, kind, selectedTrackId);
          console.log("[drop] Adding clip:", assetKey, "to track:", compatibleTrackId, "at:", time.toFixed(2));
          handleAssetDrop(assetKey, compatibleTrackId ?? undefined, time);
        }
      }
      return;
    }

    // Handle internal asset drag from AssetPanel
    const assetKey = event.dataTransfer.getData("asset-key");
    const assetKind = event.dataTransfer.getData("asset-kind") as TrackKind;
    if (!assetKey || !dataRef.current) {
      return;
    }

    const editArea2 = event.currentTarget.querySelector<HTMLElement>(".timeline-editor-edit-area");
    const grid2 = event.currentTarget.querySelector<HTMLElement>(".ReactVirtualized__Grid");
    const rect = (editArea2 ?? event.currentTarget).getBoundingClientRect();
    const scrollLeft = grid2?.scrollLeft ?? event.currentTarget.scrollLeft;
    const pixelsPerSecond = scaleWidth / scale;
    const dropX = event.clientX - rect.left;
    const time = Math.max(0, (dropX + scrollLeft - TIMELINE_START_LEFT) / pixelsPerSecond);

    const rowElements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".timeline-editor-edit-row"));
    const rowIndex = rowElements.findIndex((rowElement) => {
      const rowRect = rowElement.getBoundingClientRect();
      return event.clientY >= rowRect.top && event.clientY <= rowRect.bottom;
    });
    const targetTrackId = rowIndex >= 0 ? dataRef.current!.rows[rowIndex]?.id : undefined;
    const compatibleTrackId = getCompatibleTrackId(dataRef.current!.tracks, targetTrackId, assetKind || "visual", selectedTrackId);
    handleAssetDrop(assetKey, compatibleTrackId ?? undefined, time);
  }, [dataRef, handleAssetDrop, scale, scaleWidth, selectedTrackId, uploadFiles]);

  const handleDeleteClip = useCallback((clipId: string) => {
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

    const nextResolvedConfig = updateClipInConfig(resolvedConfig, selectedClipId, (clip) => {
      const { x, y, width, height, ...rest } = clip;
      return rest;
    });

    applyResolvedConfigEdit(nextResolvedConfig, { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleSplitSelectedClip = useCallback(() => {
    if (!resolvedConfig || !selectedClipId) {
      return;
    }

    const result = splitClipAtPlayhead(resolvedConfig, selectedClipId, currentTime);
    if (result.nextSelectedClipId) {
      applyResolvedConfigEdit(result.config, { selectedClipId: result.nextSelectedClipId });
    }
  }, [applyResolvedConfigEdit, currentTime, resolvedConfig, selectedClipId]);

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
    const action: TimelineAction = {
      id: clipId,
      start: currentTime,
      end: currentTime + duration,
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
  }, [applyTimelineEdit, currentTime, data, selectedTrack, setSelectedClipId, setSelectedTrackId]);

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
