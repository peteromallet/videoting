import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TrackDefinition } from "@shared/types";
import { TrackSettingsBody } from "./TrackPanel";

type PopoverPosition = {
  left: number;
  top: number;
};

interface TrackSettingsPopoverProps {
  track: TrackDefinition;
  trackCount: number;
  trackIndex: number;
  sameKindCount: number;
  onChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  onReorder: (trackId: string, direction: -1 | 1) => void;
  onRemove: (trackId: string) => void;
  onSelect?: (trackId: string) => void;
}

const DEFAULT_WIDTH = 220;
const VIEWPORT_PADDING = 8;

const SettingsIcon = () => {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 4h10M3 8h10M3 12h10M6 4a1.5 1.5 0 1 1 0-.001M10 8a1.5 1.5 0 1 1 0-.001M7 12a1.5 1.5 0 1 1 0-.001"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
};

export function TrackSettingsPopover({
  track,
  trackCount,
  trackIndex,
  sameKindCount,
  onChange,
  onReorder,
  onRemove,
  onSelect,
}: TrackSettingsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = () => {
    const anchor = triggerRef.current;
    if (!anchor) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popoverWidth = popoverRef.current?.getBoundingClientRect().width ?? DEFAULT_WIDTH;
    const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 0;

    let left = anchorRect.right + 8;
    if (left + popoverWidth > window.innerWidth - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, anchorRect.left - popoverWidth - 8);
    }

    let top = anchorRect.top;
    if (popoverHeight > 0 && top + popoverHeight > window.innerHeight - VIEWPORT_PADDING) {
      top = Math.max(VIEWPORT_PADDING, window.innerHeight - popoverHeight - VIEWPORT_PADDING);
    }

    setPosition({ left, top });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updatePosition();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen, track.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target
        && (popoverRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleViewportChange = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`track-label-gear${isOpen ? " open" : ""}`}
        aria-label={`Open settings for ${track.label ?? track.id}`}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.(track.id);
          setIsOpen((open) => !open);
        }}
      >
        <SettingsIcon />
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={popoverRef}
            className="track-settings-popover"
            style={position ?? { left: VIEWPORT_PADDING, top: VIEWPORT_PADDING }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="track-panel-header">
              <strong>{track.id}</strong>
              <span className="track-panel-kind">{track.kind}</span>
              <div className="track-panel-actions">
                <button
                  type="button"
                  onClick={() => onReorder(track.id, -1)}
                  disabled={trackIndex === 0}
                  title="Move track up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(track.id, 1)}
                  disabled={trackIndex === trackCount - 1}
                  title="Move track down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onRemove(track.id);
                  }}
                  disabled={sameKindCount <= 1}
                  title="Remove track"
                >
                  ×
                </button>
              </div>
            </div>

            <label className="track-panel-field">
              <span>Label</span>
              <input
                type="text"
                value={track.label ?? track.id}
                onChange={(event) => onChange(track.id, { label: event.currentTarget.value })}
                className="clip-panel-input"
              />
            </label>

            <TrackSettingsBody track={track} onChange={(patch) => onChange(track.id, patch)} />
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
