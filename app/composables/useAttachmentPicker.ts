import { useFileDialog } from "@vueuse/core";

import type { MediaItem } from "~/types";

export interface PickedMedia {
  file: File;
  path: string;
  kind: MediaItem["kind"];
}

export interface PickedFile {
  file: File;
  path: string;
  name: string;
  format: string;
  size: number;
}

const UNSAFE_EXTENSIONS = [".exe", ".bat", ".sh", ".js"];

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MEDIA_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];

const TYPES_OF = { image: IMAGE_TYPES, video: VIDEO_TYPES, all: MEDIA_TYPES };

/**
 * Opens the browser's file chooser for photos, videos or both, or files, and hands back object URLs.
 * Files it refuses are counted to `onRejected`, so the caller can say why they are missing.
 */
export function useAttachmentPicker(handlers: {
  onMedia: (media: PickedMedia[]) => void;
  onFiles: (files: PickedFile[]) => void;
  onRejected?: (count: number) => void;
}) {
  const reportRejected = (all: File[], kept: File[]) => {
    if (all.length > kept.length) handlers.onRejected?.(all.length - kept.length);
  };

  // What the open media chooser asked for; anything else that comes back is refused.
  let mediaTypes = MEDIA_TYPES;
  const media = useFileDialog({
    multiple: true,
    accept: MEDIA_TYPES.join(", "),
    reset: true,
  });
  media.onChange((list) => {
    const all = Array.from(list ?? []);
    // The chooser's filter is only a hint; some platforms let anything through.
    const kept = all.filter((file) => mediaTypes.includes(file.type));
    reportRejected(all, kept);
    const picked = kept.map((file) => ({
      file,
      path: URL.createObjectURL(file),
      kind: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
    }));
    if (picked.length) handlers.onMedia(picked);
  });

  const files = useFileDialog({ multiple: true, reset: true });
  files.onChange((list) => {
    const all = Array.from(list ?? []);
    const kept = all.filter(
      (file) => !UNSAFE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext)),
    );
    reportRejected(all, kept);
    const picked = kept.map((file) => ({
      file,
      name: file.name,
      path: URL.createObjectURL(file),
      format: file.type || file.name.split(".").pop() || "",
      size: file.size,
    }));
    if (picked.length) handlers.onFiles(picked);
  });

  // Must run inside the click handler: browsers only open a chooser on a user gesture.
  const pickMedia = (kind: MediaItem["kind"] | "all" = "all") => {
    mediaTypes = TYPES_OF[kind];
    media.open({ accept: mediaTypes.join(", ") });
  };

  return { pickMedia, pickFiles: () => files.open() };
}
