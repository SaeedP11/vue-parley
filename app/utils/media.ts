import type { MediaItem, Message } from "~/types";

/** A message's album: its `media`, or, from hosts that only send photos, its `imageUrl`. */
export const messageMedia = (message: Pick<Message, "media" | "imageUrl">): MediaItem[] =>
  message.media?.length
    ? message.media
    : (message.imageUrl ?? [])
        .filter((url) => url?.trim())
        .map((url) => ({ url, kind: "image" as const }));

/** "Video" when every item of the album is a video, otherwise "Photo". */
export const albumKind = (items: MediaItem[]): MediaItem["kind"] =>
  items.length > 0 && items.every((m) => m.kind === "video") ? "video" : "image";

/** m:ss (or h:mm:ss) for a media duration in seconds. */
export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
