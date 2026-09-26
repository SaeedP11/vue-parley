import { useFileDialog } from "@vueuse/core";

export interface PickedImage {
  file: File;
  path: string;
}

export interface PickedFile extends PickedImage {
  name: string;
  format: string;
  size: number;
}

const UNSAFE_EXTENSIONS = [".exe", ".bat", ".sh", ".js"];

/** Opens the browser's file chooser for images or files and hands back object URLs. */
export function useAttachmentPicker(handlers: {
  onImages: (images: PickedImage[]) => void;
  onFiles: (files: PickedFile[]) => void;
}) {
  const images = useFileDialog({
    multiple: true,
    accept: "image/jpeg, image/png, image/webp, image/gif",
    reset: true,
  });
  images.onChange((list) => {
    const picked = Array.from(list ?? [])
      .filter((file) => file.type !== "image/svg+xml")
      .map((file) => ({ file, path: URL.createObjectURL(file) }));
    if (picked.length) handlers.onImages(picked);
  });

  const files = useFileDialog({ multiple: true, reset: true });
  files.onChange((list) => {
    const picked = Array.from(list ?? [])
      .filter(
        (file) =>
          !UNSAFE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext)),
      )
      .map((file) => ({
        file,
        name: file.name,
        path: URL.createObjectURL(file),
        format: file.type || file.name.split(".").pop() || "",
        size: file.size,
      }));
    if (picked.length) handlers.onFiles(picked);
  });

  // Must run inside the click handler: browsers only open a chooser on a user gesture.
  return { pickImages: () => images.open(), pickFiles: () => files.open() };
}
