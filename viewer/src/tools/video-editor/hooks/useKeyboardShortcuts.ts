import { useEffect } from "react";
import { isEditableTarget } from "@/tools/video-editor/lib/coordinate-utils";

interface UseKeyboardShortcutsOptions {
  hasSelectedClip: boolean;
  moveSelectedClipToTrack: (direction: "up" | "down") => void;
  togglePlayPause: () => void;
  toggleMute: () => void;
  splitSelectedClip: () => void;
  clearSelection: () => void;
}

export function useKeyboardShortcuts({
  hasSelectedClip,
  moveSelectedClipToTrack,
  togglePlayPause,
  toggleMute,
  splitSelectedClip,
  clearSelection,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveSelectedClipToTrack("up");
        return;
      }

      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveSelectedClipToTrack("down");
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePlayPause();
        return;
      }

      if (event.key.toLowerCase() === "m" && hasSelectedClip) {
        event.preventDefault();
        toggleMute();
        return;
      }

      if (event.key.toLowerCase() === "s" && hasSelectedClip) {
        event.preventDefault();
        splitSelectedClip();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection, hasSelectedClip, moveSelectedClipToTrack, splitSelectedClip, toggleMute, togglePlayPause]);
}
