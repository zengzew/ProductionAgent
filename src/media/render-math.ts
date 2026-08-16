import type {MediaShotAudio, MediaShotCrop, MediaShotDucking, MediaShotTransform} from "./render";

/**
 * WP-M5.08 pure render math — the deterministic transform/audio/opacity
 * functions shared by the Node-side pipeline (`src/media/render.ts`) and the
 * browser-side generic Remotion renderer (`src/media/remotion.tsx`).
 *
 * This module MUST stay free of Node imports (fs/path/crypto/child_process
 * and anything that pulls them in): it is bundled into the Remotion
 * composition, so any Node-only dependency would break Studio/rendering.
 * The shot/plan TYPES are imported type-only from `./render` (erased at
 * compile time — no runtime cycle).
 */

const roundScore = (value: number): number => Math.round(value * 1e6) / 1e6;

export type MediaShotTransformState = {
  /** Total scale (crop 1/width × extra scale × zoom). */
  scale: number;
  /** Horizontal offset in px (position + zoom-pan drift). */
  translateX: number;
  /** Vertical offset in px. */
  translateY: number;
  /** CSS transform-origin of the crop, in percent of the source frame. */
  transformOriginX: number;
  transformOriginY: number;
};

export const mediaShotCropOrigin = (crop: MediaShotCrop): {x: number; y: number} => ({
  x: roundScore((crop.x + crop.width / 2) * 100),
  y: roundScore((crop.y + crop.height / 2) * 100),
});

/**
 * Deterministic transform state of a shot at a shot-relative frame:
 * crop scale (1/crop.width), extra scale, zoom-pan zoom/drift, and position
 * offsets. Identical plans produce identical states.
 */
export const mediaShotTransformAtFrame = (input: {
  frame: number;
  fps: number;
  durationFrames: number;
  canvas: {width: number; height: number};
  transform: MediaShotTransform;
}): MediaShotTransformState => {
  const {durationFrames, canvas, transform} = input;
  const frame = Math.max(0, input.frame);
  const progress = durationFrames > 1 ? Math.min(1, Math.max(0, frame / (durationFrames - 1))) : 0;
  const zoomPan = transform.zoomPan;
  let zoom = 1;
  let driftX = 0;
  let driftY = 0;
  if (zoomPan.type === "zoom-in") {
    zoom = zoomPan.start.zoom + (zoomPan.end.zoom - zoomPan.start.zoom) * progress;
    driftX = zoomPan.start.x + (zoomPan.end.x - zoomPan.start.x) * progress;
    driftY = zoomPan.start.y + (zoomPan.end.y - zoomPan.start.y) * progress;
  } else if (zoomPan.type === "pan") {
    zoom = zoomPan.end.zoom;
    driftX = zoomPan.start.x + (zoomPan.end.x - zoomPan.start.x) * progress;
    driftY = zoomPan.start.y + (zoomPan.end.y - zoomPan.start.y) * progress;
  } else if (zoomPan.type === "ken-burns") {
    zoom = zoomPan.start.zoom + (zoomPan.end.zoom - zoomPan.start.zoom) * progress;
    driftX = zoomPan.start.x + (zoomPan.end.x - zoomPan.start.x) * progress;
    driftY = zoomPan.start.y + (zoomPan.end.y - zoomPan.start.y) * progress;
  }
  const cropScale = 1 / Math.max(0.01, transform.reframe.crop.width);
  const origin = mediaShotCropOrigin(transform.reframe.crop);
  return {
    scale: roundScore(cropScale * transform.scale * zoom),
    translateX: roundScore((transform.position.x * 0.5 + driftX) * canvas.width),
    translateY: roundScore((transform.position.y * 0.5 + driftY) * canvas.height),
    transformOriginX: origin.x,
    transformOriginY: origin.y,
  };
};

/** Simple video fade/crossfade opacity at a shot-relative frame. */
export const mediaShotVideoOpacityAtFrame = (input: {
  frame: number;
  fps: number;
  durationFrames: number;
  fade: {inMs: number; outMs: number};
  crossfadeMs: number;
  isFirst: boolean;
}): number => {
  const {fps, durationFrames, fade, crossfadeMs, isFirst} = input;
  const frame = Math.max(0, input.frame);
  const fadeInMs = isFirst ? fade.inMs : Math.max(fade.inMs, crossfadeMs);
  const fadeInFrames = Math.max(1, Math.round((fadeInMs / 1000) * fps));
  const fadeOutFrames = Math.max(1, Math.round((fade.outMs / 1000) * fps));
  let opacity = 1;
  if (fadeInMs > 0 && frame < fadeInFrames) {
    opacity = Math.min(1, frame / fadeInFrames);
  }
  const fadeOutStart = Math.max(0, durationFrames - fadeOutFrames);
  if (fade.outMs > 0 && frame >= fadeOutStart) {
    opacity = Math.min(opacity, Math.max(0, 1 - (frame - fadeOutStart) / fadeOutFrames));
  }
  return roundScore(opacity);
};

/**
 * Deterministic clipping prevention: when the two gain rails would sum above
 * unity they are scaled down proportionally so the mixed output can never
 * clip at unity. Pure and exported for the renderer and tests.
 */
export const normalizeMediaShotGains = (input: {
  originalAudioGain: number;
  narrationGain: number;
}): {originalAudioGain: number; narrationGain: number} => {
  const sum = input.originalAudioGain + input.narrationGain;
  if (sum <= 1 + 1e-9) {
    return {
      originalAudioGain: roundScore(input.originalAudioGain),
      narrationGain: roundScore(input.narrationGain),
    };
  }
  const factor = 1 / sum;
  return {
    originalAudioGain: roundScore(input.originalAudioGain * factor),
    narrationGain: roundScore(input.narrationGain * factor),
  };
};

/** Linear gain factor for a dB reduction. */
export const mediaShotDuckingGainFactor = (reductionDb: number): number =>
  roundScore(10 ** (-reductionDb / 20));

/** Linear fade gain of one audio rail at a shot-relative frame. */
export const mediaShotAudioFadeGainAtFrame = (input: {
  frame: number;
  fps: number;
  fadeInMs: number;
  fadeOutMs: number;
  durationFrames: number;
}): number => {
  const {fps, fadeInMs, fadeOutMs, durationFrames} = input;
  const frame = Math.max(0, input.frame);
  let gain = 1;
  const fadeInFrames = Math.max(1, Math.round((fadeInMs / 1000) * fps));
  const fadeOutFrames = Math.max(1, Math.round((fadeOutMs / 1000) * fps));
  if (fadeInMs > 0 && frame < fadeInFrames) {
    gain = Math.min(1, frame / fadeInFrames);
  }
  const fadeOutStart = Math.max(0, durationFrames - fadeOutFrames);
  if (fadeOutMs > 0 && frame >= fadeOutStart) {
    gain = Math.min(gain, Math.max(0, 1 - (frame - fadeOutStart) / fadeOutFrames));
  }
  return roundScore(gain);
};

/**
 * Ducking gain applied to the original clip audio at a shot-relative frame.
 * While narration is active the original gain is reduced by `reductionDb`
 * with linear attack/release ramps. In the generic mix composition narration
 * spans the whole scene, so the ramps sit at the scene boundaries. Returns 1
 * when ducking is disabled or there is no original audio.
 */
export const mediaShotDuckingGainAtFrame = (input: {
  frame: number;
  fps: number;
  durationFrames: number;
  ducking: MediaShotDucking;
  originalAudioGain: number;
}): number => {
  const {fps, durationFrames, ducking} = input;
  if (!ducking.enabled || input.originalAudioGain <= 0) return 1;
  const frame = Math.max(0, input.frame);
  const factor = mediaShotDuckingGainFactor(ducking.reductionDb);
  const depth = 1 - factor;
  const attackFrames = Math.max(1, Math.round((ducking.attackMs / 1000) * fps));
  const releaseFrames = Math.max(1, Math.round((ducking.releaseMs / 1000) * fps));
  let ducked = factor;
  if (frame < attackFrames) {
    ducked = factor + depth * (1 - frame / attackFrames);
  }
  const releaseStart = Math.max(0, durationFrames - releaseFrames);
  if (frame >= releaseStart) {
    const progress = Math.min(1, (frame - releaseStart) / releaseFrames);
    ducked = factor + depth * progress;
  }
  return roundScore(ducked);
};

/**
 * The deterministic per-frame audio rails of one shot: original clip gain
 * (with ducking + fades) and narration gain (with fades). Sum of the rails at
 * unity never exceeds 1, so the mix cannot clip.
 */
export const mediaShotAudioGainsAtFrame = (input: {
  frame: number;
  fps: number;
  durationFrames: number;
  audio: MediaShotAudio;
}): {originalGain: number; narrationGain: number} => {
  const {frame, fps, durationFrames, audio} = input;
  const fade = mediaShotAudioFadeGainAtFrame({
    frame,
    fps,
    fadeInMs: audio.fadeInMs,
    fadeOutMs: audio.fadeOutMs,
    durationFrames,
  });
  const duck = mediaShotDuckingGainAtFrame({
    frame,
    fps,
    durationFrames,
    ducking: audio.ducking,
    originalAudioGain: audio.originalAudioGain,
  });
  return {
    originalGain: roundScore(audio.originalAudioGain * duck * fade),
    narrationGain: roundScore(audio.narrationGain * fade),
  };
};

/** Public path convention shared by the composition and the pipeline. */
export const mediaRenderPublicFilePath = (episodeId: string, filename: string): string =>
  `episodes/${episodeId}/media/${filename}`;
