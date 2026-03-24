import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "@xzdarcy/react-timeline-editor";
import type { TimelineState } from "@xzdarcy/react-timeline-editor";
import type { TimelineAction, TimelineRow } from "@xzdarcy/timeline-engine";
import { getConfigSignature, parseResolution } from "@shared/config-utils";
import {
  addTrack,
  getTrackById,
  getVisualTracks,
  splitClipAtPlayhead,
  toggleClipMute,
  updateClipInConfig,
} from "@shared/editor-utils";
import { serializeForDisk } from "@shared/serialize";
import type { ClipType, TrackDefinition, TrackKind } from "@shared/types";
import AssetPanel from "./AssetPanel";
import { ClipPanel } from "./ClipPanel";
import OverlayEditor from "./OverlayEditor";
import RemotionPreview, { type PreviewHandle } from "./RemotionPreview";
import {
  buildTimelineData,
  configToRows,
  getAssetColor,
  getNextClipId,
  getSourceTime,
  inferTrackType,
  loadTimelineJson,
  resolveTimelineConfig,
  rowsToConfig,
  type ClipMeta,
  type ClipOrderMap,
  type TimelineData,
} from "./timeline-data";
import { useCrossTrackDrag, type ActionDragState } from "./useCrossTrackDrag";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import "./App.css";

const ROW_HEIGHT = 56;
const SCALE_SECONDS = 5;
const TIMELINE_START_LEFT = 20;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
};

const updateClipOrder = (
  current: ClipOrderMap,
  trackId: string,
  update: (ids: string[]) => string[],
): ClipOrderMap => {
  return {
    ...current,
    [trackId]: update(current[trackId] ?? []),
  };
};

const buildTrackClipOrder = (tracks: TrackDefinition[], clipOrder: ClipOrderMap, removedIds: string[] = []): ClipOrderMap => {
  return Object.fromEntries(
    tracks.map((track) => [
      track.id,
      (clipOrder[track.id] ?? []).filter((clipId) => !removedIds.includes(clipId)),
    ]),
  );
};

const moveClipBetweenTracks = (
  clipOrder: ClipOrderMap,
  clipId: string,
  sourceTrackId: string,
  targetTrackId: string,
): ClipOrderMap => {
  if (sourceTrackId === targetTrackId) {
    return clipOrder;
  }

  return {
    ...clipOrder,
    [sourceTrackId]: (clipOrder[sourceTrackId] ?? []).filter((id) => id !== clipId),
    [targetTrackId]: [...(clipOrder[targetTrackId] ?? []).filter((id) => id !== clipId), clipId],
  };
};

const getCompatibleTrackId = (
  tracks: TrackDefinition[],
  desiredTrackId: string | undefined,
  assetKind: TrackKind,
  selectedTrackId: string | null,
): string | null => {
  const compatibleTracks = tracks.filter((track) => track.kind === assetKind);
  if (compatibleTracks.length === 0) {
    return null;
  }

  if (desiredTrackId) {
    const exact = compatibleTracks.find((track) => track.id === desiredTrackId);
    if (exact) {
      return exact.id;
    }
  }

  if (selectedTrackId) {
    const selected = compatibleTracks.find((track) => track.id === selectedTrackId);
    if (selected) {
      return selected.id;
    }
  }

  if (assetKind === "visual") {
    return compatibleTracks.find((track) => track.id === "V2")?.id ?? compatibleTracks[0].id;
  }

  return compatibleTracks.find((track) => track.id === "A1")?.id ?? compatibleTracks[0].id;
};

const buildRowTrackPatches = (
  rows: TimelineRow[],
): Record<string, Partial<ClipMeta>> => {
  const patches: Record<string, Partial<ClipMeta>> = {};
  for (const row of rows) {
    for (const action of row.actions) {
      patches[action.id] = { track: row.id };
    }
  }

  return patches;
};

function App() {
  const timelineRef = useRef<TimelineState>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const isSyncingFromPreview = useRef(false);
  const isSyncingFromTimeline = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignature = useRef("");
  const dataRef = useRef<TimelineData | null>(null);
  const resizeStartRef = useRef<Record<string, { start: number; from: number }>>({});

  const [data, setData] = useState<TimelineData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [renderLog, setRenderLog] = useState("");
  const [renderDirty, setRenderDirty] = useState(false);
  const [scaleWidth, setScaleWidth] = useState(160);
  const scale = SCALE_SECONDS;

  dataRef.current = data;

  const materializeData = useCallback((
    current: TimelineData,
    rows: TimelineRow[],
    meta: Record<string, ClipMeta>,
    clipOrder: ClipOrderMap,
  ): TimelineData => {
    const config = rowsToConfig(rows, meta, current.output, clipOrder, current.tracks);
    const resolvedConfig = resolveTimelineConfig(config, current.registry);
    const rowData = configToRows(config);

    return {
      ...current,
      config,
      resolvedConfig,
      rows: rowData.rows,
      meta: rowData.meta,
      clipOrder: rowData.clipOrder,
      effects: rowData.effects,
      tracks: config.tracks ?? [],
      output: { ...config.output },
      signature: getConfigSignature(resolvedConfig),
    };
  }, []);

  const saveTimeline = useCallback(async (nextData: TimelineData) => {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/save-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextData.config),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSaveStatus("saved");
      setRenderDirty(true);
      lastSavedSignature.current = nextData.signature;
    } catch {
      setSaveStatus("error");
    }
  }, []);

  const scheduleSave = useCallback((nextData: TimelineData) => {
    setSaveStatus("dirty");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveTimeline(nextData);
    }, 500);
  }, [saveTimeline]);

  const commitData = useCallback((
    nextData: TimelineData,
    options?: {
      save?: boolean;
      selectedClipId?: string | null;
      selectedTrackId?: string | null;
      updateLastSavedSignature?: boolean;
    },
  ) => {
    setData(nextData);
    if (options?.selectedClipId !== undefined) {
      setSelectedClipId(options.selectedClipId);
    } else if (selectedClipId && !nextData.meta[selectedClipId]) {
      setSelectedClipId(null);
    }

    if (options?.selectedTrackId !== undefined) {
      setSelectedTrackId(options.selectedTrackId);
    } else {
      const fallbackTrackId = selectedTrackId && nextData.tracks.some((track) => track.id === selectedTrackId)
        ? selectedTrackId
        : nextData.tracks[0]?.id ?? null;
      setSelectedTrackId(fallbackTrackId);
    }

    if (options?.updateLastSavedSignature) {
      lastSavedSignature.current = nextData.signature;
    }

    if (options?.save ?? true) {
      scheduleSave(nextData);
    }
  }, [scheduleSave, selectedClipId, selectedTrackId]);

  const applyTimelineEdit = useCallback((
    nextRows: TimelineRow[],
    metaUpdates?: Record<string, Partial<ClipMeta>>,
    metaDeletes?: string[],
    clipOrderOverride?: ClipOrderMap,
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextMeta: Record<string, ClipMeta> = { ...current.meta };
    if (metaUpdates) {
      for (const [clipId, patch] of Object.entries(metaUpdates)) {
        nextMeta[clipId] = nextMeta[clipId] ? { ...nextMeta[clipId], ...patch } : (patch as ClipMeta);
      }
    }

    if (metaDeletes) {
      for (const clipId of metaDeletes) {
        delete nextMeta[clipId];
      }
    }

    const clipOrder = clipOrderOverride ?? buildTrackClipOrder(current.tracks, current.clipOrder, metaDeletes);
    const nextData = materializeData(current, nextRows, nextMeta, clipOrder);
    commitData(nextData);
  }, [commitData, materializeData]);

  const applyResolvedConfigEdit = useCallback((
    nextResolvedConfig: TimelineData["resolvedConfig"],
    options?: { selectedClipId?: string | null; selectedTrackId?: string | null },
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextData = buildTimelineData(serializeForDisk(nextResolvedConfig), current.registry);
    commitData(nextData, {
      selectedClipId: options?.selectedClipId,
      selectedTrackId: options?.selectedTrackId,
    });
  }, [commitData]);

  useEffect(() => {
    const poll = async () => {
      try {
        const loaded = await loadTimelineJson();
        if (loaded.signature !== lastSavedSignature.current) {
          commitData(loaded, { save: false, updateLastSavedSignature: true });
        }
      } catch {
        // Ignore transient polling failures.
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [commitData]);

  const resolvedConfig = data?.resolvedConfig ?? null;
  const selectedClip = useMemo(() => {
    if (!resolvedConfig || !selectedClipId) {
      return null;
    }
    return resolvedConfig.clips.find((clip) => clip.id === selectedClipId) ?? null;
  }, [resolvedConfig, selectedClipId]);

  const selectedTrack = useMemo(() => {
    if (!data) {
      return null;
    }

    const preferredTrackId = selectedClip?.track ?? selectedTrackId;
    return preferredTrackId ? getTrackById(data.resolvedConfig, preferredTrackId) : data.tracks[0] ?? null;
  }, [data, selectedClip, selectedTrackId]);

  const selectedClipHasPredecessor = useMemo(() => {
    if (!resolvedConfig || !selectedClip) {
      return false;
    }

    const siblings = resolvedConfig.clips
      .filter((clip) => clip.track === selectedClip.track)
      .sort((left, right) => left.at - right.at);
    const selectedIndex = siblings.findIndex((clip) => clip.id === selectedClip.id);
    return selectedIndex > 0;
  }, [resolvedConfig, selectedClip]);

  const compositionSize = useMemo(() => {
    return data ? parseResolution(data.output.resolution) : { width: 1280, height: 720 };
  }, [data]);

  const trackScaleMap = useMemo(() => {
    if (!data) {
      return {};
    }

    return Object.fromEntries(data.tracks.map((track) => [track.id, track.scale ?? 1]));
  }, [data]);

  const lastTimeUpdateRef = useRef(0);
  const onPreviewTimeUpdate = useCallback((time: number) => {
    if (isSyncingFromTimeline.current) {
      return;
    }

    timelineRef.current?.setTime(time);

    const now = performance.now();
    if (now - lastTimeUpdateRef.current > 250) {
      lastTimeUpdateRef.current = now;
      isSyncingFromPreview.current = true;
      setCurrentTime(time);
      requestAnimationFrame(() => {
        isSyncingFromPreview.current = false;
      });
    }
  }, []);

  const onCursorDrag = useCallback((time: number) => {
    if (isSyncingFromPreview.current) {
      return;
    }

    isSyncingFromTimeline.current = true;
    previewRef.current?.seek(time);
    setCurrentTime(time);
    requestAnimationFrame(() => {
      isSyncingFromTimeline.current = false;
    });
  }, []);

  const onClickTimeArea = useCallback((time: number) => {
    previewRef.current?.seek(time);
    setCurrentTime(time);
    return undefined;
  }, []);

  const timelineWrapperRef = useRef<HTMLDivElement | null>(null);
  const crossTrackActive = useRef(false);
  const actionDragStateRef = useRef<Record<string, ActionDragState>>({});

  const clearActionDragState = useCallback((clipId: string) => {
    delete actionDragStateRef.current[clipId];
  }, []);

  const moveClipToRow = useCallback((clipId: string, targetRowId: string, newStartTime?: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const sourceRow = current.rows.find((row) => row.actions.some((action) => action.id === clipId));
    const targetRow = current.rows.find((row) => row.id === targetRowId);
    if (!sourceRow || !targetRow) {
      return;
    }

    const sourceTrack = current.tracks.find((track) => track.id === sourceRow.id);
    const targetTrack = current.tracks.find((track) => track.id === targetRow.id);
    const action = sourceRow.actions.find((candidate) => candidate.id === clipId);
    if (!sourceTrack || !targetTrack || !action || sourceTrack.kind !== targetTrack.kind) {
      return;
    }

    const duration = action.end - action.start;
    const nextStart = typeof newStartTime === "number" ? Math.max(0, newStartTime) : action.start;
    const nextAction = { ...action, start: nextStart, end: nextStart + duration };
    const nextRows = current.rows.map((row) => {
      if (sourceRow.id === targetRow.id && row.id === sourceRow.id) {
        return {
          ...row,
          actions: row.actions.map((candidate) => (candidate.id === clipId ? nextAction : candidate)),
        };
      }

      if (row.id === sourceRow.id) {
        return { ...row, actions: row.actions.filter((candidate) => candidate.id !== clipId) };
      }

      if (row.id === targetRow.id) {
        return { ...row, actions: [...row.actions, nextAction] };
      }

      return row;
    });

    const nextClipOrder = moveClipBetweenTracks(current.clipOrder, clipId, sourceRow.id, targetRow.id);
    applyTimelineEdit(nextRows, { [clipId]: { track: targetRow.id } }, undefined, nextClipOrder);
  }, [applyTimelineEdit]);

  const createTrackAndMoveClip = useCallback((clipId: string, kind: TrackKind, newStartTime?: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const sourceClip = current.resolvedConfig.clips.find((clip) => clip.id === clipId);
    const sourceTrack = sourceClip ? current.resolvedConfig.tracks.find((track) => track.id === sourceClip.track) : null;
    if (!sourceClip || !sourceTrack || sourceTrack.kind !== kind) {
      return;
    }

    const nextResolvedConfigBase = addTrack(current.resolvedConfig, kind);
    const newTrack = nextResolvedConfigBase.tracks.find((track) => {
      return !current.resolvedConfig.tracks.some((existingTrack) => existingTrack.id === track.id);
    }) ?? nextResolvedConfigBase.tracks[nextResolvedConfigBase.tracks.length - 1];
    if (!newTrack) {
      return;
    }

    const nextResolvedConfig = {
      ...nextResolvedConfigBase,
      clips: nextResolvedConfigBase.clips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        return {
          ...clip,
          at: typeof newStartTime === "number" ? Math.max(0, newStartTime) : clip.at,
          track: newTrack.id,
        };
      }),
    };

    applyResolvedConfigEdit(nextResolvedConfig, {
      selectedClipId: clipId,
      selectedTrackId: newTrack.id,
    });
  }, [applyResolvedConfigEdit]);

  // Move selected clip to a different compatible track (up/down in the track stack)
  const moveSelectedClipToTrack = useCallback((direction: "up" | "down") => {
    const current = dataRef.current;
    if (!current || !selectedClipId) {
      return;
    }

    const currentRowIndex = current.rows.findIndex((row) => row.actions.some((action) => action.id === selectedClipId));
    if (currentRowIndex < 0) {
      return;
    }

    const sourceTrack = current.tracks.find((track) => track.id === current.rows[currentRowIndex]?.id);
    if (!sourceTrack) {
      return;
    }

    let targetRowIndex = currentRowIndex;
    while (true) {
      targetRowIndex += direction === "up" ? -1 : 1;
      if (targetRowIndex < 0 || targetRowIndex >= current.rows.length) {
        return;
      }

      const targetTrack = current.tracks.find((track) => track.id === current.rows[targetRowIndex]?.id);
      if (targetTrack?.kind === sourceTrack.kind) {
        moveClipToRow(selectedClipId, targetTrack.id);
        setSelectedTrackId(targetTrack.id);
        return;
      }
    }
  }, [moveClipToRow, selectedClipId]);

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

  // Keyboard shortcut: Alt+Up/Down to move clip between tracks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) {
        return;
      }

      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        moveSelectedClipToTrack("up");
      } else if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        moveSelectedClipToTrack("down");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveSelectedClipToTrack]);

  const onActionMoveStart = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow }) => {
    actionDragStateRef.current[action.id] = {
      rowId: row.id,
      initialStart: action.start,
      initialEnd: action.end,
      latestStart: action.start,
      latestEnd: action.end,
    };
  }, []);

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
  }, []);

  const onActionMoveEnd = useCallback(({ action }: { action: TimelineAction; row: TimelineRow; start: number; end: number }) => {
    if (!crossTrackActive.current) {
      clearActionDragState(action.id);
    }
  }, [clearActionDragState]);

  const onActionResizeStart = useCallback(({ action }: { action: TimelineAction }) => {
    const clipMeta = dataRef.current?.meta[action.id];
    if (!clipMeta || typeof clipMeta.hold === "number") {
      return;
    }

    resizeStartRef.current[action.id] = {
      start: action.start,
      from: clipMeta.from ?? 0,
    };
  }, []);

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
  }, [applyTimelineEdit]);

  const onChange = useCallback((nextRows: TimelineRow[]) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    if (crossTrackActive.current) {
      return false;
    }

    applyTimelineEdit(nextRows, buildRowTrackPatches(nextRows));
    return undefined;
  }, [applyTimelineEdit]);

  const onOverlayChange = useCallback((actionId: string, patch: Partial<ClipMeta>) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    applyTimelineEdit(current.rows, { [actionId]: patch });
  }, [applyTimelineEdit]);

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

    const nextRows = current.rows.map((row) => {
      return row.id === resolvedTrackId ? { ...row, actions: [...row.actions, action] } : row;
    });

    const nextClipOrder = updateClipOrder(current.clipOrder, resolvedTrackId, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, { [clipId]: clipMeta }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(resolvedTrackId);
  }, [applyTimelineEdit, selectedTrackId]);

  const onTimelineDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("asset-key")) {
      event.preventDefault();
      event.currentTarget.classList.add("drag-over");
    }
  }, []);

  const onTimelineDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove("drag-over");
  }, []);

  const onTimelineDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    const assetKey = event.dataTransfer.getData("asset-key");
    const assetKind = event.dataTransfer.getData("asset-kind") as TrackKind;
    if (!assetKey || !dataRef.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = event.currentTarget.scrollLeft;
    const pixelsPerSecond = scaleWidth / scale;
    const dropX = event.clientX - rect.left;
    const time = Math.max(0, (dropX + scrollLeft - TIMELINE_START_LEFT) / pixelsPerSecond);

    const rowElements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".timeline-editor-edit-row"));
    const rowIndex = rowElements.findIndex((rowElement) => {
      const rowRect = rowElement.getBoundingClientRect();
      return event.clientY >= rowRect.top && event.clientY <= rowRect.bottom;
    });
    const targetTrackId = rowIndex >= 0 ? dataRef.current.rows[rowIndex]?.id : undefined;
    const compatibleTrackId = getCompatibleTrackId(dataRef.current.tracks, targetTrackId, assetKind || "visual", selectedTrackId);
    handleAssetDrop(assetKey, compatibleTrackId ?? undefined, time);
  }, [handleAssetDrop, scale, scaleWidth, selectedTrackId]);

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
  }, [applyTimelineEdit, selectedClipId]);

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

  const handleAddTrack = useCallback((kind: TrackKind) => {
    if (!resolvedConfig) {
      return;
    }

    const nextResolvedConfig = addTrack(resolvedConfig, kind);
    const nextTrack = nextResolvedConfig.tracks[nextResolvedConfig.tracks.length - 1] ?? null;
    applyResolvedConfigEdit(nextResolvedConfig, { selectedTrackId: nextTrack?.id ?? null });
  }, [applyResolvedConfigEdit, resolvedConfig]);

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
    const nextRows = data.rows.map((row) => {
      return row.id === visualTrack.id ? { ...row, actions: [...row.actions, action] } : row;
    });
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
  }, [applyTimelineEdit, currentTime, data, selectedTrack]);

  const getActionRender = useCallback((action: TimelineAction) => {
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!clipMeta) {
      return null;
    }

    const label = clipMeta.clipType === "text"
      ? clipMeta.text?.content?.slice(0, 28) || "Text"
      : clipMeta.asset ?? "Clip";
    const color = getAssetColor(clipMeta.asset ?? `${clipMeta.clipType ?? "clip"}-${clipMeta.track}`);
    const sourceEnd = typeof clipMeta.hold === "number"
      ? action.end - action.start
      : getSourceTime({ from: clipMeta.from ?? 0, start: action.start, speed: clipMeta.speed ?? 1 }, action.end);
    const isMuted = (clipMeta.volume ?? 1) <= 0;
    const transitionWidth = clipMeta.transition
      ? `${Math.min(50, ((clipMeta.transition.duration ?? 0.5) / Math.max(0.1, action.end - action.start)) * 100)}%`
      : undefined;

    return (
      <div
        className={`clip-action${selectedClipId === action.id ? " selected" : ""}${isMuted ? " muted" : ""}${clipMeta.continuous ? " clip-action-pattern" : ""}`}
        data-clip-id={action.id}
        data-row-id={clipMeta.track}
        style={{ backgroundColor: color }}
        onMouseDown={() => {
          setSelectedClipId(action.id);
          setSelectedTrackId(clipMeta.track);
        }}
      >
        {clipMeta.entrance ? <span className="clip-wedge clip-wedge-in" /> : null}
        {clipMeta.exit ? <span className="clip-wedge clip-wedge-out" /> : null}
        {clipMeta.transition ? <span className="clip-transition-overlay" style={{ width: transitionWidth }} /> : null}
        <span className="clip-label">{label}</span>
        <span className="clip-time">
          {clipMeta.clipType === "text"
            ? `${(action.end - action.start).toFixed(1)}s`
            : `src ${(clipMeta.from ?? 0).toFixed(1)}s - ${sourceEnd.toFixed(1)}s`}
        </span>
        {clipMeta.transition ? <span className="clip-badge">{clipMeta.transition.type}</span> : null}
        {isMuted ? <span className="clip-badge">Muted</span> : null}
        <button
          className="clip-delete-btn"
          title="Delete clip"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            handleDeleteClip(action.id);
          }}
        >
          ×
        </button>
      </div>
    );
  }, [handleDeleteClip, selectedClipId]);

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

  const handleZoomIn = useCallback(() => {
    setScaleWidth((value) => Math.min(value * 1.4, 500));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScaleWidth((value) => Math.max(value / 1.4, 40));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        previewRef.current?.togglePlayPause();
        return;
      }

      if (event.key.toLowerCase() === "m" && selectedClipId) {
        event.preventDefault();
        handleToggleMute();
        return;
      }

      if (event.key.toLowerCase() === "s" && selectedClipId) {
        event.preventDefault();
        handleSplitSelectedClip();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedClipId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleSplitSelectedClip, handleToggleMute, selectedClipId]);

  const startRender = useCallback(async () => {
    if (renderStatus === "rendering") {
      return;
    }

    setRenderStatus("rendering");
    setRenderLog("");
    try {
      const response = await fetch("/api/render", { method: "POST" });
      const reader = response.body?.getReader();
      if (!reader) {
        setRenderStatus("error");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: done")) {
            setRenderStatus("done");
            setRenderDirty(false);
          } else if (line.startsWith("event: error")) {
            setRenderStatus("error");
          } else if (line.startsWith("data: ")) {
            setRenderLog((currentLog) => currentLog + line.slice(6) + "\n");
          }
        }
      }
    } catch {
      setRenderStatus("error");
    }
  }, [renderStatus]);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const statusIndicator = {
    saved: "●",
    saving: "◌",
    dirty: "○",
    error: "✕",
  }[saveStatus];

  const statusColor = {
    saved: "#98c379",
    saving: "#e5c07b",
    dirty: "#e5c07b",
    error: "#e06c75",
  }[saveStatus];

  if (!data || !resolvedConfig) {
    return <div className="app app-loading">Loading timeline...</div>;
  }

  return (
    <div className="app">
      <div className="top-bar">
        <h1>Timeline Editor</h1>
        <div className="top-bar-right">
          <button
            className={`render-btn${renderDirty ? " render-dirty" : ""}${renderStatus === "rendering" ? " rendering" : ""}`}
            onClick={startRender}
            disabled={renderStatus === "rendering"}
            title={renderLog || undefined}
          >
            {renderStatus === "rendering" ? "Rendering..." : "Render"}
          </button>
          <button className="track-add-btn" type="button" onClick={() => handleAddTrack("visual")}>Add Visual</button>
          <button className="track-add-btn" type="button" onClick={() => handleAddTrack("audio")}>Add Audio</button>
          <button className="track-add-btn" type="button" onClick={handleAddText}>Add Text</button>
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={handleZoomOut} title="Zoom out">−</button>
            <button className="zoom-btn" onClick={handleZoomIn} title="Zoom in">+</button>
          </div>
          <span className="save-status" style={{ color: statusColor }}>
            {statusIndicator} {saveStatus}
          </span>
          <span className="timecode">{formatTime(currentTime)}</span>
        </div>
      </div>

      <div className="video-container">
        <div className="preview-section">
          <RemotionPreview
            ref={previewRef}
            config={resolvedConfig}
            onTimeUpdate={onPreviewTimeUpdate}
            playerContainerRef={playerContainerRef}
          />
          <OverlayEditor
            rows={data.rows}
            meta={data.meta}
            currentTime={currentTime}
            playerContainerRef={playerContainerRef}
            trackScaleMap={trackScaleMap}
            compositionWidth={compositionSize.width}
            compositionHeight={compositionSize.height}
            onOverlayChange={onOverlayChange}
          />
        </div>

        <div className="right-sidebar">
          <AssetPanel
            assetMap={data.assetMap}
            rows={data.rows}
            meta={data.meta}
            backgroundAsset={data.output.background ?? undefined}
          />
          <ClipPanel
            clip={selectedClip}
            track={selectedTrack}
            hasPredecessor={selectedClipHasPredecessor}
            onChange={handleSelectedClipChange}
            onClose={() => setSelectedClipId(null)}
            onSplit={handleSplitSelectedClip}
            onToggleMute={handleToggleMute}
            playheadSeconds={currentTime}
          />
        </div>
      </div>

      <div className="timeline-container">
        <div className="track-labels">
          {data.tracks.map((track) => (
              <div
                key={track.id}
                className={`track-label${selectedTrackId === track.id ? " selected" : ""}`}
                style={{ height: ROW_HEIGHT, minHeight: ROW_HEIGHT, maxHeight: ROW_HEIGHT }}
                onClick={() => setSelectedTrackId(track.id)}
              >
                <span className="track-label-id">{track.id}</span>
                <span className="track-label-name">{track.label}</span>
              </div>
          ))}
        </div>

        <div
          ref={timelineWrapperRef}
          className="timeline-wrapper"
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
    </div>
  );
}

export default App;
