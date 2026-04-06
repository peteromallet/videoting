import { memo } from "react";
import type { TimelineAction } from "@xzdarcy/timeline-engine";
import { getAssetColor, getSourceTime, type ClipMeta } from "@/tools/video-editor/lib/timeline-data";

interface ClipActionProps {
  action: TimelineAction;
  clipMeta: ClipMeta;
  isSelected: boolean;
  thumbnailSrc?: string;
  onSelect: (clipId: string, trackId: string) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const shallowEqualObject = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
};

const shallowEqualEffects = (left: ClipMeta["effects"], right: ClipMeta["effects"]): boolean => {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((effect, index) => shallowEqualObject(effect, right[index]));
  }

  return shallowEqualObject(left, right);
};

function ClipActionComponent({ action, clipMeta, isSelected, thumbnailSrc, onSelect }: ClipActionProps) {
  const isUploading = action.id.startsWith("uploading-");
  const color = isUploading ? "#6c7086" : getAssetColor(clipMeta.asset ?? `${clipMeta.clipType ?? "clip"}-${clipMeta.track}`);

  // Minimal render for very narrow clips — just a colored/thumbnail block
  if (!isUploading && thumbnailSrc === undefined && (action.end - action.start) < 0.5) {
    return (
      <div
        className={`clip-action h-full overflow-hidden rounded-sm border select-none ${isSelected ? "ring-2 ring-white/50" : ""}`}
        data-clip-id={action.id}
        data-row-id={clipMeta.track}
        style={{ backgroundColor: color, borderColor: "rgba(255,255,255,0.12)" }}
        onClick={() => onSelect(action.id, clipMeta.track)}
      />
    );
  }

  const label = isUploading
    ? (clipMeta.asset?.replace(/^uploading:/, "") ?? "File")
    : clipMeta.clipType === "text" ? clipMeta.text?.content?.slice(0, 28) || "Text" : clipMeta.asset ?? "Clip";
  const sourceEnd = typeof clipMeta.hold === "number"
    ? action.end - action.start
    : getSourceTime({ from: clipMeta.from ?? 0, start: action.start, speed: clipMeta.speed ?? 1 }, action.end);
  const isMuted = (clipMeta.volume ?? 1) <= 0;
  const transitionWidth = clipMeta.transition
    ? `${Math.min(50, ((clipMeta.transition.duration ?? 0.5) / Math.max(0.1, action.end - action.start)) * 100)}%`
    : undefined;

  if (isUploading) {
    return (
      <div
        className="clip-action relative flex h-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-2 text-[11px] text-white shadow-sm pointer-events-none animate-pulse select-none"
        data-clip-id={action.id}
        data-row-id={clipMeta.track}
        style={{ backgroundColor: color, borderColor: "rgba(255,255,255,0.12)", backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.06) 6px, rgba(255,255,255,0.06) 12px)" }}
      >
        <div className="relative z-10 min-w-0 flex-1">
          <div className="truncate font-semibold">{label}</div>
          <div className="truncate text-[10px] text-white/85">Uploading...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group clip-action relative flex h-full min-w-0 items-center gap-2 overflow-hidden rounded-md border px-2 text-[11px] text-white shadow-sm select-none ${isSelected ? "ring-2 ring-white/50" : ""} ${isMuted ? "opacity-75 saturate-50" : ""}`}
      data-clip-id={action.id}
      data-row-id={clipMeta.track}
      style={{ backgroundColor: color, borderColor: "rgba(255,255,255,0.12)" }}
      onClick={() => onSelect(action.id, clipMeta.track)}
    >
      {thumbnailSrc ? (
        <>
          <img
            src={thumbnailSrc}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-black/65" />
        </>
      ) : null}
      {clipMeta.entrance ? <span className="absolute inset-y-0 left-0 w-4 bg-white/12 [clip-path:polygon(0_0,100%_50%,0_100%)]" /> : null}
      {clipMeta.exit ? <span className="absolute inset-y-0 right-0 w-4 bg-black/18 [clip-path:polygon(100%_0,100%_100%,0_50%)]" /> : null}
      {clipMeta.transition ? <span className="pointer-events-none absolute inset-y-0 left-0 bg-black/20" style={{ width: transitionWidth }} /> : null}
      <div className="relative z-10 min-w-0 flex-1">
        <div className="truncate font-semibold">{label}</div>
        <div className="truncate text-[10px] text-white/85">
          {clipMeta.clipType === "text"
            ? `${(action.end - action.start).toFixed(1)}s`
            : `src ${(clipMeta.from ?? 0).toFixed(1)}s - ${sourceEnd.toFixed(1)}s`}
        </div>
      </div>
      {clipMeta.transition ? <span className="relative z-10 rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]">{clipMeta.transition.type}</span> : null}
      {isMuted ? <span className="relative z-10 rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]">Muted</span> : null}
    </div>
  );
}

const MemoizedClipAction = memo(ClipActionComponent, (prevProps, nextProps) => {
  return (
    prevProps.action.id === nextProps.action.id
    && prevProps.action.start === nextProps.action.start
    && prevProps.action.end === nextProps.action.end
    && prevProps.clipMeta.asset === nextProps.clipMeta.asset
    && prevProps.clipMeta.track === nextProps.clipMeta.track
    && prevProps.clipMeta.clipType === nextProps.clipMeta.clipType
    && prevProps.clipMeta.from === nextProps.clipMeta.from
    && prevProps.clipMeta.to === nextProps.clipMeta.to
    && prevProps.clipMeta.speed === nextProps.clipMeta.speed
    && prevProps.clipMeta.hold === nextProps.clipMeta.hold
    && prevProps.clipMeta.volume === nextProps.clipMeta.volume
    && prevProps.clipMeta.text?.content === nextProps.clipMeta.text?.content
    && shallowEqualObject(prevProps.clipMeta.entrance, nextProps.clipMeta.entrance)
    && shallowEqualObject(prevProps.clipMeta.exit, nextProps.clipMeta.exit)
    && shallowEqualObject(prevProps.clipMeta.transition, nextProps.clipMeta.transition)
    && shallowEqualEffects(prevProps.clipMeta.effects, nextProps.clipMeta.effects)
    && prevProps.isSelected === nextProps.isSelected
    && prevProps.thumbnailSrc === nextProps.thumbnailSrc
  );
});

export function ClipAction(props: ClipActionProps) {
  return <MemoizedClipAction {...props} />;
}
