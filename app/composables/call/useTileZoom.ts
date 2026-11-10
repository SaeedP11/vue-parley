import { computed, reactive, type Ref } from "vue";

const MAX_SCALE = 5;

/** Zoom (wheel, pinch) and pan for one call tile's video. `mirrored` flips x, so its pan runs the other way. */
export function useTileZoom(area: Ref<HTMLElement | null>, mirrored: Ref<boolean>) {
  const view = reactive({ scale: 1, x: 0, y: 0 });
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const zoomed = computed(() => view.scale > 1);

  function clamp() {
    const rect = area.value?.getBoundingClientRect();
    if (!rect) return;
    const maxX = ((view.scale - 1) * rect.width) / 2;
    const maxY = ((view.scale - 1) * rect.height) / 2;
    view.x = Math.min(maxX, Math.max(-maxX, view.x));
    view.y = Math.min(maxY, Math.max(-maxY, view.y));
  }

  // Keeps the point at (clientX, clientY) still while scaling.
  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const rect = area.value?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX === undefined ? 0 : clientX - rect.left - rect.width / 2;
    const py = clientY === undefined ? 0 : clientY - rect.top - rect.height / 2;
    const scale = Math.min(MAX_SCALE, Math.max(1, view.scale * factor));
    const k = scale / view.scale;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.scale = scale;
    clamp();
  }

  function reset() {
    Object.assign(view, { scale: 1, x: 0, y: 0 });
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX, event.clientY);
  }

  function onPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest("button")) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  }

  function onPointerMove(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0) zoomAt(distance / pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      pinch = distance;
      return;
    }
    if (!zoomed.value) return;
    view.x += event.clientX - last.x;
    view.y += event.clientY - last.y;
    clamp();
  }

  function onPointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
  }

  const videoStyle = computed(() =>
    zoomed.value
      ? { transform: `translate(${mirrored.value ? -view.x : view.x}px, ${view.y}px) scale(${view.scale})` }
      : undefined,
  );

  return { zoomed, videoStyle, reset, onWheel, onPointerDown, onPointerMove, onPointerUp };
}
