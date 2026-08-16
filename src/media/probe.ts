import {spawnSync} from "node:child_process";

/**
 * Media probing via ffprobe. The probe result is the deterministic source of
 * truth for media classification, container detection, and the metadata fields
 * that land on a MediaAsset. Anything ffprobe cannot read fails closed.
 */

export type MediaProbeCategory = "video" | "audio" | "image";

export type MediaProbe = {
  category: MediaProbeCategory | null;
  /** Raw `format_name` reported by ffprobe (e.g. "mov,mp4,m4a,3gp,3g2,mj2"). */
  containerFormat: string | null;
  /** Canonicalized container token used for extension/MIME conflict checks. */
  canonicalContainer: string | null;
  /** Media type derived from the real probe; null when unsupported/unreadable. */
  mediaType: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  audioChannels: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  /** First video stream pixel format (e.g. "yuv420p"); null for audio/images. */
  pixelFormat: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
};

const IMAGE_CODECS = new Set(["mjpeg", "png", "webp", "gif"]);
const IMAGE_CONTAINERS = new Set(["jpeg", "png", "webp", "gif"]);

const VIDEO_MEDIA_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",
};

const AUDIO_MEDIA_TYPES: Record<string, string> = {
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
};

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const IMAGE_CODEC_MEDIA_TYPES: Record<string, string> = {
  mjpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const IMAGE_CODEC_CONTAINERS: Record<string, string> = {
  mjpeg: "jpeg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

/**
 * Canonical container for a probed `format_name`. The mp4/mov families share
 * one ffmpeg demuxer ("mov,mp4,m4a,3gp,3g2,mj2") so they normalize to "mp4";
 * matroska/webm normalize to their distinct tokens so extension conflicts such
 * as `.mp4` bytes in a webm container are still detectable.
 */
export const canonicalContainerForFormat = (formatName: string | null): string | null => {
  if (!formatName) return null;
  const format = formatName.toLowerCase();
  if (format.includes("webm")) return "webm";
  if (format.includes("matroska")) return "mkv";
  if (format.includes("mp4") || format.includes("m4a") || format.includes("3gp")) return "mp4";
  if (format.includes("mov")) return "mov";
  if (format.includes("mpeg")) return "mpeg";
  if (format.includes("avi")) return "avi";
  if (format.includes("jpeg_pipe") || format.includes("mjpeg")) return "jpeg";
  if (format.includes("png_pipe")) return "png";
  if (format.includes("webp")) return "webp";
  if (format.includes("gif")) return "gif";
  if (format.includes("wav")) return "wav";
  if (format.includes("mp3")) return "mp3";
  if (format.includes("aac")) return "aac";
  if (format.includes("flac")) return "flac";
  if (format.includes("ogg")) return "ogg";
  return null;
};

/** Containers that share a demuxer family and are therefore interchangeable for conflict checks. */
const CONTAINER_FAMILIES: string[][] = [
  ["mp4", "mov"],
  ["webm", "mkv"],
];

export const containersCompatible = (left: string | null, right: string | null): boolean => {
  if (left === null || right === null || left === right) return true;
  return CONTAINER_FAMILIES.some((family) => family.includes(left) && family.includes(right));
};

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseFrameRate = (value: unknown): number | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const [numerator, denominator] = value.split("/");
  const num = Number(numerator);
  const den = denominator ? Number(denominator) : 1;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num <= 0) return null;
  return Math.round((num / den) * 1000) / 1000;
};

const durationMsFrom = (
  format: Record<string, unknown>,
  streams: Record<string, unknown>[],
): number | null => {
  const seconds = numberOrNull(format.duration);
  if (seconds !== null && seconds > 0) return Math.round(seconds * 1000);
  for (const stream of streams) {
    const streamSeconds = numberOrNull(stream.duration);
    if (streamSeconds !== null && streamSeconds > 0) return Math.round(streamSeconds * 1000);
  }
  return null;
};

/**
 * Runs ffprobe on one file and returns a fully classified probe. Any ffprobe
 * failure (missing binary, unreadable file, malformed output) throws
 * `MEDIA_INGEST_PROBE_FAILED` so nothing unverified can reach the registry.
 */
export const probeMediaFile = (filePath: string, ffprobePath = "ffprobe"): MediaProbe => {
  const result = spawnSync(
    ffprobePath,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
    {encoding: "utf8"},
  );
  if (result.error || result.status !== 0) {
    throw new Error(`MEDIA_INGEST_PROBE_FAILED:${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error(`MEDIA_INGEST_PROBE_FAILED:${filePath}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`MEDIA_INGEST_PROBE_FAILED:${filePath}`);
  }
  const root = parsed as Record<string, unknown>;
  const format = (root.format ?? {}) as Record<string, unknown>;
  const rawStreams = Array.isArray(root.streams) ? root.streams : [];
  const streams = rawStreams.filter(
    (stream): stream is Record<string, unknown> =>
      Boolean(stream) && typeof stream === "object" && !Array.isArray(stream),
  );

  const containerFormat = typeof format.format_name === "string" ? format.format_name : null;
  let canonicalContainer = canonicalContainerForFormat(containerFormat);
  const videoStream = streams.find((stream) => stream.codec_type === "video") ?? null;
  const audioStream = streams.find((stream) => stream.codec_type === "audio") ?? null;
  const videoCodec = typeof videoStream?.codec_name === "string" ? videoStream.codec_name : null;
  const audioCodec = typeof audioStream?.codec_name === "string" ? audioStream.codec_name : null;
  const pixelFormat = typeof videoStream?.pix_fmt === "string" ? videoStream.pix_fmt : null;
  // Standalone still images (e.g. a single PNG) may probe as `image2` with no
  // pipe format name; the still-image codec then defines the container.
  if (!canonicalContainer && videoCodec && IMAGE_CODEC_CONTAINERS[videoCodec]) {
    canonicalContainer = IMAGE_CODEC_CONTAINERS[videoCodec];
  }

  const isImage =
    Boolean(videoStream) &&
    !audioStream &&
    Boolean(
      videoCodec &&
      IMAGE_CODECS.has(videoCodec) &&
      (IMAGE_CONTAINERS.has(canonicalContainer ?? "") ||
        videoStream?.nb_frames === "1" ||
        videoStream?.nb_frames === 1),
    );

  const category: MediaProbeCategory | null = isImage
    ? "image"
    : videoStream
      ? "video"
      : audioStream
        ? "audio"
        : null;

  let mediaType: string | null = null;
  if (category === "image") {
    mediaType =
      (videoCodec ? IMAGE_CODEC_MEDIA_TYPES[videoCodec] : undefined) ??
      (canonicalContainer ? IMAGE_MEDIA_TYPES[canonicalContainer] : undefined) ??
      null;
  } else if (category === "video" && canonicalContainer) {
    mediaType = VIDEO_MEDIA_TYPES[canonicalContainer] ?? null;
  } else if (category === "audio" && canonicalContainer) {
    mediaType = AUDIO_MEDIA_TYPES[canonicalContainer] ?? null;
  }

  const width = videoStream ? numberOrNull(videoStream.width) : null;
  const height = videoStream ? numberOrNull(videoStream.height) : null;
  const fps = videoStream ? parseFrameRate(videoStream.avg_frame_rate) : null;
  const audioChannels = audioStream ? numberOrNull(audioStream.channels) : null;

  return {
    category,
    containerFormat,
    canonicalContainer,
    mediaType,
    durationMs: category === "image" ? null : durationMsFrom(format, streams),
    width: width !== null && width > 0 ? Math.round(width) : null,
    height: height !== null && height > 0 ? Math.round(height) : null,
    fps,
    audioChannels: audioChannels !== null && audioChannels > 0 ? Math.round(audioChannels) : null,
    videoCodec,
    audioCodec,
    pixelFormat,
    hasVideo: Boolean(videoStream),
    hasAudio: Boolean(audioStream),
  };
};

/** Standard editorial frame rates; the proxy fps is snapped to the nearest one. */
export const STANDARD_FRAME_RATES = [24, 25, 30, 50, 60] as const;

/**
 * Deterministic fps contract for normalization: the nearest standard rate,
 * ties resolving to the lower rate, and a fixed fallback of 30 when the probe
 * is missing or unusable.
 */
export const normalizedFrameRate = (probed: number | null): number => {
  if (probed === null || !Number.isFinite(probed) || probed <= 0) return 30;
  let best: number = STANDARD_FRAME_RATES[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of STANDARD_FRAME_RATES) {
    const delta = Math.abs(probed - candidate);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
};
