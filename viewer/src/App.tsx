import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "@xzdarcy/react-timeline-editor";
import type { TimelineState } from "@xzdarcy/react-timeline-editor";
import type { TimelineAction, TimelineRow } from "@xzdarcy/timeline-engine";
import { getConfigSignature, parseResolution } from "@shared/config-utils";
import { splitClipAtPlayhead, toggleClipMute, updateClipInConfig } from "@shared/editor-utils";
import { serializeForDisk } from "@shared/serialize";
import type { TimelineTrack } from "@shared/types";
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
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import "./App.css";

function getRowLabel(rowId: string, meta: Record<string, ClipMeta>, rows: TimelineRow[]): string {
  if (rowId === "row-video") {
    return "Video";
  }

  if (rowId === "row-overlay") {
    return "Overlay";
  }

  if (rowId.startsWith("row-audio")) {
    const row = rows.find((entry) => entry.id === rowId);
    if (row && row.actions.length > 0) {
      const clipMeta = meta[row.actions[0].id];
      if (clipMeta) {
        return clipMeta.asset;
      }
    }
    return "Audio";
  }

  return rowId;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const updateClipOrder = (
  current: ClipOrderMap,
  track: TimelineTrack,
  update: (ids: string[]) => string[],
): ClipOrderMap => {
  return {
    video: track === "video" ? update(current.video) : current.video,
    audio: track === "audio" ? update(current.audio) : current.audio,
    overlay: track === "overlay" ? update(current.overlay) : current.overlay,
  };
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
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [renderStatus, setRenderStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [renderLog, setRenderLog] = useState("");
  const [renderDirty, setRenderDirty] = useState(false);
  const [scaleWidth, setScaleWidth] = useState(160);
  const scale = 5;

  dataRef.current = data;

  const materializeData = useCallback((
    current: TimelineData,
    rows: TimelineRow[],
    meta: Record<string, ClipMeta>,
    clipOrder: ClipOrderMap,
  ): TimelineData => {
    const config = rowsToConfig(rows, meta, current.output, clipOrder);
    const resolvedConfig = resolveTimelineConfig(config, current.registry);
    return {
      ...current,
      config,
      resolvedConfig,
      rows,
      meta,
      clipOrder,
      effects: configToRows(config).effects,
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
    options?: { save?: boolean; selectedClipId?: string | null; updateLastSavedSignature?: boolean },
  ) => {
    setData(nextData);
    if (options?.selectedClipId !== undefined) {
      setSelectedClipId(options.selectedClipId);
    } else if (selectedClipId && !nextData.meta[selectedClipId]) {
      setSelectedClipId(null);
    }

    if (options?.updateLastSavedSignature) {
      lastSavedSignature.current = nextData.signature;
    }

    if (options?.save ?? true) {
      scheduleSave(nextData);
    }
  }, [scheduleSave, selectedClipId]);

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

    const nextClipOrder = clipOrderOverride ?? {
      video: current.clipOrder.video.filter((clipId) => !metaDeletes?.includes(clipId)),
      audio: current.clipOrder.audio.filter((clipId) => !metaDeletes?.includes(clipId)),
      overlay: current.clipOrder.overlay.filter((clipId) => !metaDeletes?.includes(clipId)),
    };
    const nextData = materializeData(current, nextRows, nextMeta, nextClipOrder);
    commitData(nextData);
  }, [commitData, materializeData]);

  const applyResolvedConfigEdit = useCallback((
    nextResolvedConfig: TimelineData["resolvedConfig"],
    options?: { selectedClipId?: string | null },
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextData = buildTimelineData(serializeForDisk(nextResolvedConfig), current.registry);
    commitData(nextData, { selectedClipId: options?.selectedClipId });
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

  const compositionSize = useMemo(() => {
    return data ? parseResolution(data.output.resolution) : { width: 1280, height: 720 };
  }, [data]);

  const lastTimeUpdateRef = useRef(0);
  const onPreviewTimeUpdate = useCallback((time: number) => {
    if (isSyncingFromTimeline.current) {
      return;
    }

    // Update the timeline cursor directly (doesn't trigger React re-render)
    timelineRef.current?.setTime(time);

    // Only update React state at ~4fps to avoid re-rendering the Player
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

  const onActionResizeEnd = useCallback(({ action, row, dir }: { action: TimelineAction; row: TimelineRow; dir: string }) => {
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!current || !clipMeta) {
      return;
    }

    const metaUpdates: Record<string, Partial<ClipMeta>> = {};
    if (typeof clipMeta.hold !== "number") {
      if (dir === "left") {
        const origin = resizeStartRef.current[action.id];
        if (origin) {
          metaUpdates[action.id] = {
            from: Math.max(0, origin.from + (action.start - origin.start) * (clipMeta.speed ?? 1)),
          };
        }
      }

      if (dir === "right") {
        metaUpdates[action.id] = {
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
    applyTimelineEdit(nextRows);
  }, [applyTimelineEdit]);

  const onOverlayChange = useCallback((actionId: string, patch: Partial<ClipMeta>) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }
    applyTimelineEdit(current.rows, { [actionId]: patch });
  }, [applyTimelineEdit]);

  const handleAssetDrop = useCallback((assetKey: string, trackType: string, time: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const assetEntry = current.registry.assets[assetKey];
    const inferredTrack = inferTrackType(assetEntry?.file ?? assetKey);
    const track = (trackType || inferredTrack) as TimelineTrack;
    const baseDuration = Math.max(1, Math.min(assetEntry?.duration ?? 5, track === "audio" ? assetEntry?.duration ?? 10 : 5));

    let clipMeta: ClipMeta;
    let duration: number;
    if (track === "video") {
      duration = baseDuration;
      clipMeta = {
        asset: assetKey,
        track,
        from: 0,
        to: baseDuration,
        speed: 1,
        volume: 1,
      };
    } else if (track === "audio") {
      duration = assetEntry?.duration ?? 10;
      clipMeta = {
        asset: assetKey,
        track,
        from: 0,
        to: duration,
        speed: 1,
        volume: 1,
      };
    } else {
      duration = 5;
      clipMeta = {
        asset: assetKey,
        track,
        hold: duration,
        x: 100,
        y: 100,
        width: 320,
        height: 240,
        opacity: 1,
      };
    }

    const action: TimelineAction = {
      id: clipId,
      start: time,
      end: time + duration,
      effectId: `effect-${clipId}`,
    };

    let nextRows: TimelineRow[];
    if (track === "video") {
      nextRows = current.rows.map((row) => {
        return row.id === "row-video" ? { ...row, actions: [...row.actions, action] } : row;
      });
    } else if (track === "overlay") {
      nextRows = current.rows.map((row) => {
        return row.id === "row-overlay" ? { ...row, actions: [...row.actions, action] } : row;
      });
    } else {
      const existingRow = current.rows.find((row) => {
        return row.id.startsWith("row-audio") && row.actions.some((entry) => current.meta[entry.id]?.asset === assetKey);
      });

      if (existingRow) {
        nextRows = current.rows.map((row) => {
          return row.id === existingRow.id ? { ...row, actions: [...row.actions, action] } : row;
        });
      } else {
        const nextAudioIndex = current.rows.filter((row) => row.id.startsWith("row-audio")).length;
        const nextAudioRow: TimelineRow = {
          id: `row-audio-${nextAudioIndex}`,
          actions: [action],
        };
        const overlayIndex = current.rows.findIndex((row) => row.id === "row-overlay");
        nextRows = [...current.rows];
        nextRows.splice(overlayIndex >= 0 ? overlayIndex : nextRows.length, 0, nextAudioRow);
      }
    }

    const nextClipOrder = updateClipOrder(current.clipOrder, track, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, { [clipId]: clipMeta }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
  }, [applyTimelineEdit]);

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
    const trackType = event.dataTransfer.getData("track-type");
    if (!assetKey) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = event.currentTarget.scrollLeft;
    const pixelsPerSecond = scaleWidth / scale;
    const dropX = event.clientX - rect.left;
    const time = Math.max(0, (dropX + scrollLeft - 20) / pixelsPerSecond);
    handleAssetDrop(assetKey, trackType, time);
  }, [handleAssetDrop, scale, scaleWidth]);

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
        effects: patch.effects !== undefined ? patch.effects : clip.effects,
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

  const getActionRender = useCallback((action: TimelineAction) => {
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!clipMeta) {
      return null;
    }

    const color = getAssetColor(clipMeta.asset);
    const sourceEnd = typeof clipMeta.hold === "number"
      ? action.end - action.start
      : getSourceTime({ from: clipMeta.from ?? 0, start: action.start, speed: clipMeta.speed ?? 1 }, action.end);
    const isMuted = (clipMeta.volume ?? 1) <= 0;

    return (
      <div
        className={`clip-action${selectedClipId === action.id ? " selected" : ""}${isMuted ? " muted" : ""}`}
        style={{ backgroundColor: color }}
        onMouseDown={() => setSelectedClipId(action.id)}
      >
        <span className="clip-label">{clipMeta.asset}</span>
        <span className="clip-time">
          src {(clipMeta.from ?? 0).toFixed(1)}s - {sourceEnd.toFixed(1)}s
        </span>
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
            backgroundScale={data.output.background_scale ?? 1}
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
          {data.rows.map((row) => (
            <div key={row.id} className="track-label">
              {getRowLabel(row.id, data.meta, data.rows)}
            </div>
          ))}
        </div>

        <div
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
            startLeft={20}
            rowHeight={40}
            autoScroll
            dragLine
            getActionRender={getActionRender}
            onCursorDrag={onCursorDrag}
            onClickTimeArea={onClickTimeArea}
            onActionResizeStart={onActionResizeStart}
            onActionResizeEnd={onActionResizeEnd}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
