const linear = (from: number, to: number, progress: number): number =>
  from + (to - from) * Math.min(1, Math.max(0, progress));

/**
 * Fades a scene without passing a non-monotonic range to Remotion interpolate.
 * Short scenes use the available frames for the two transitions and never produce NaN.
 */
export const fadeSceneOpacity = (
  frame: number,
  duration: number,
  startsVisible = false,
): number => {
  const total = Math.max(1, duration);
  const fadeFrames = Math.min(10, Math.floor(total / 2));
  const fadeInStart = startsVisible ? 1 : 0;

  if (frame >= total) return 0;
  if (fadeFrames > 0 && frame < fadeFrames) {
    return linear(fadeInStart, 1, frame / fadeFrames);
  }
  if (fadeFrames > 0 && frame >= total - fadeFrames) {
    return linear(1, 0, (frame - (total - fadeFrames)) / fadeFrames);
  }
  return 1;
};
