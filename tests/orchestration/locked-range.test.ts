import {describe, expect, it} from "vitest";
import {
  assertLockedRangesPreserved,
  type ArtifactRef,
  type LockedRange,
} from "../../src/orchestration";

const ref = (sha256: string, revision: number): ArtifactRef => ({
  artifactId: "episode-lock:story:final-script",
  episodeId: "episode-lock",
  path: "content/episode-lock/story/final-script.md",
  mediaType: "text/markdown",
  schemaVersion: "final-script-v1",
  revision,
  sha256,
  sizeBytes: 100,
  producer: "fixture",
  createdAt: "2026-08-10T00:00:00.000Z",
});

const before = ref("a".repeat(64), 1);
const candidate = ref("b".repeat(64), 2);
const lock: LockedRange = {
  lockId: "human-lock-lines-10-20",
  artifactRef: before,
  locator: {kind: "line-range", value: "10-20"},
};

describe("WP-M2-07 locked range enforcement", () => {
  it("allows a precisely declared non-overlapping automated edit", () => {
    expect(() =>
      assertLockedRangesPreserved({
        before,
        candidate,
        lockedRanges: [lock],
        changedLocators: [{kind: "line-range", value: "1-9"}],
      }),
    ).not.toThrow();
  });

  it("rejects overlap and treats a missing changed locator as whole-artifact modification", () => {
    expect(() =>
      assertLockedRangesPreserved({
        before,
        candidate,
        lockedRanges: [lock],
        changedLocators: [{kind: "line-range", value: "20-25"}],
      }),
    ).toThrow(/LOCKED_RANGE_OVERWRITE:human-lock-lines-10-20/u);
    expect(() => assertLockedRangesPreserved({before, candidate, lockedRanges: [lock]})).toThrow(
      /LOCKED_RANGE_OVERWRITE:human-lock-lines-10-20/u,
    );
  });

  it("rejects lock metadata that is not bound to the current selected bytes", () => {
    expect(() =>
      assertLockedRangesPreserved({
        before,
        candidate,
        lockedRanges: [{...lock, artifactRef: ref("c".repeat(64), 3)}],
        changedLocators: [{kind: "line-range", value: "1-2"}],
      }),
    ).toThrow(/LOCKED_RANGE_BASE_MISMATCH/u);
  });

  it("protects nested JSON pointers while allowing sibling changes", () => {
    const jsonLock: LockedRange = {
      lockId: "human-lock-segment",
      artifactRef: before,
      locator: {kind: "json-pointer", value: "/segments/2/narration"},
    };
    expect(() =>
      assertLockedRangesPreserved({
        before,
        candidate,
        lockedRanges: [jsonLock],
        changedLocators: [{kind: "json-pointer", value: "/segments/3"}],
      }),
    ).not.toThrow();
    expect(() =>
      assertLockedRangesPreserved({
        before,
        candidate,
        lockedRanges: [jsonLock],
        changedLocators: [{kind: "json-pointer", value: "/segments/2"}],
      }),
    ).toThrow(/LOCKED_RANGE_OVERWRITE:human-lock-segment/u);
  });
});
