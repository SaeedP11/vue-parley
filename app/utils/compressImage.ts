/** Re-encode still photos only; keep animation, transparency, and originals that are smaller. */
export async function compressImage(file: File): Promise<File | null> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return null;
  // APNG and animated WebP need all their frames, which canvas cannot preserve.
  if (file.type !== 'image/jpeg') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    let offset = file.type === 'image/png' ? 8 : 12;
    while (offset + 8 <= bytes.length) {
      const png = file.type === 'image/png';
      const nameOffset = offset + (png ? 4 : 0);
      const name = String.fromCharCode(...bytes.subarray(nameOffset, nameOffset + 4));
      if (name === 'acTL' || name === 'ANIM' || name === 'ANMF') return null;
      const length = view.getUint32(offset + (png ? 0 : 4), !png);
      const next = offset + 8 + length + (png ? 4 : length % 2);
      if (next > bytes.length || next <= offset) return null;
      offset = next;
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // PNG is kept lossless to preserve transparency. Other formats keep their original type.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.8));
    if (!blob || blob.type !== file.type || blob.size >= file.size) return null;
    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
