/**
 * Re-encodes a video in the browser (WebCodecs, through mediabunny) to a smaller MP4: the long side
 * capped at 1280 px, at most 30 fps, medium quality. mediabunny is loaded on first use, so chats
 * that never send a video never download it.
 *
 * Resolves to `null` when the video should go out as it is: the browser can't encode, the file is
 * small already, a track would be lost, or the result isn't meaningfully smaller. Rejects only when
 * `signal` aborts.
 */

const MAX_SIDE = 1280;
const MAX_FPS = 30;
// Below this a re-encode saves too little to be worth the wait.
const MIN_BYTES = 1024 * 1024;
// The result must save at least this share of the original, or the original is sent.
const MIN_SAVING = 0.1;

export interface CompressVideoOptions {
  /** 0 to 1. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export const canCompressVideo = () =>
  typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";

export async function compressVideo(
  file: File,
  { onProgress, signal }: CompressVideoOptions = {},
): Promise<File | null> {
  if (!canCompressVideo() || file.size < MIN_BYTES) return null;
  signal?.throwIfAborted();

  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;

    const [displayWidth, displayHeight] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
    ]);
    const scale = Math.min(1, MAX_SIDE / Math.max(displayWidth, displayHeight));
    // Encoders want even dimensions.
    const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
    const width = even(displayWidth);
    const height = even(displayHeight);

    const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1", "hevc"], {
      width,
      height,
      quality: mb.QUALITY_MEDIUM,
    });
    if (!codec) return null;

    // Phones record at 60 fps; only ever resample down, never add frames.
    const { averagePacketRate } = await track.computePacketStats(90);
    const frameRate = averagePacketRate > MAX_FPS + 2 ? MAX_FPS : undefined;

    signal?.throwIfAborted();

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: {
        width,
        height,
        fit: "fill",
        frameRate,
        codec,
        quality: mb.QUALITY_MEDIUM,
        forceTranscode: true,
      },
      // Copied when MP4 can carry it as it is, re-encoded otherwise.
      audio: { quality: mb.QUALITY_MEDIUM },
    });

    // A silent or missing picture is worse than a big file.
    if (!conversion.isValid || conversion.discardedTracks.length) return null;

    const abort = () => void conversion.cancel();
    signal?.addEventListener("abort", abort, { once: true });
    if (onProgress) conversion.onProgress = (progress) => onProgress(progress);

    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", abort);
    }

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength > file.size * (1 - MIN_SAVING)) return null;

    const name = file.name.replace(/\.[^.]*$/, "") + ".mp4";
    return new File([buffer], name, { type: "video/mp4", lastModified: file.lastModified });
  } catch (error) {
    signal?.throwIfAborted();
    // An unreadable container or a failing encoder: send the original.
    console.warn("[vue-parley] video compression failed, sending the original", error);
    return null;
  } finally {
    input.dispose();
  }
}
