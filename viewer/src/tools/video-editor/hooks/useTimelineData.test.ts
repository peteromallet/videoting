import { describe, expect, it } from "vitest";
import { shouldAcceptPolledData, useTimelineData } from "./useTimelineData";

describe("useTimelineData", () => {
  it("exports the hook function", () => {
    expect(typeof useTimelineData).toBe("function");
  });
});

describe("shouldAcceptPolledData", () => {
  it("rejects polled data while local edits are ahead of saved state", () => {
    expect(shouldAcceptPolledData(2, 1, "polled-next", "saved-prev")).toBe(false);
  });

  it("accepts polled data when edit and saved sequences match but signatures differ", () => {
    expect(shouldAcceptPolledData(3, 3, "polled-next", "saved-prev")).toBe(true);
  });

  it("rejects polled data when edit and saved sequences match and signatures are unchanged", () => {
    expect(shouldAcceptPolledData(3, 3, "saved-prev", "saved-prev")).toBe(false);
  });

  it("keeps polling blocked after an out-of-order save if newer edits still exist", () => {
    expect(shouldAcceptPolledData(5, 4, "polled-next", "saved-seq-4")).toBe(false);
  });

  it("keeps polling blocked after save errors leave saved sequence behind", () => {
    expect(shouldAcceptPolledData(7, 6, "disk-state", "last-good-save")).toBe(false);
  });
});
