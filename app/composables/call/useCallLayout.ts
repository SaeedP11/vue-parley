import { computed, ref, watch, type Ref } from "vue";
import type { Participant } from "./session";

/** One tile on the call screen: someone's camera (the user's own is `self`), or a screen share. */
export interface CallTileInfo {
  /** Stable per tile: `self_cam`, `self_screen`, `remote_video_<id>`, `remote_screen_<id>`. */
  id: string;
  kind: "camera" | "screen" | "self";
  participantId: string;
}

/**
 * How the call screen arranges its tiles (research R7):
 * - `solo`: alone, the user's own camera fills the stage;
 * - `pair`: one other person fills it, the user's camera floats in a corner (as in 5.0);
 * - `grid`: two or three others, everyone a tile of a 2×2 grid;
 * - `stage`: a screen share or a pinned tile takes the stage, the rest sit in a strip.
 */
export type CallLayoutMode = "solo" | "pair" | "grid" | "stage";

export interface CallLayoutOptions {
  participants: Ref<Participant[]>;
  /** The call view's own size, which decides where the strip goes. */
  width: Ref<number>;
  height: Ref<number>;
}

export function useCallLayout({ participants, width, height }: CallLayoutOptions) {
  const cameraTile = (p: Participant): CallTileInfo =>
    p.isSelf
      ? { id: "self_cam", kind: "self", participantId: p.id }
      : { id: `remote_video_${p.id}`, kind: "camera", participantId: p.id };
  const screenTile = (p: Participant): CallTileInfo => ({
    id: p.isSelf ? "self_screen" : `remote_screen_${p.id}`,
    kind: "screen",
    participantId: p.id,
  });

  const cameraTiles = computed(() => participants.value.map(cameraTile));
  const screenTiles = computed(() =>
    participants.value.filter((p) => p.screen).map(screenTile),
  );
  /** Every tile, each participant's camera followed by their screen. */
  const tiles = computed(() =>
    participants.value.flatMap((p) => (p.screen ? [cameraTile(p), screenTile(p)] : [cameraTile(p)])),
  );

  // When each screen share first showed, so the newest one takes the stage.
  const screenSince = new Map<string, number>();
  let screenOrder = 0;
  const newestScreen = ref<string | null>(null);
  watch(
    screenTiles,
    (current) => {
      const ids = new Set(current.map((t) => t.id));
      for (const id of [...screenSince.keys()]) if (!ids.has(id)) screenSince.delete(id);
      for (const id of ids) if (!screenSince.has(id)) screenSince.set(id, ++screenOrder);
      // The user's own share comes last: they know what they are showing.
      const ranked = [...ids].sort(
        (a, b) =>
          Number(a === "self_screen") - Number(b === "self_screen") ||
          screenSince.get(b)! - screenSince.get(a)!,
      );
      newestScreen.value = ranked[0] ?? null;
    },
    { immediate: true },
  );

  const pinnedId = ref<string | null>(null);
  function togglePin(tileId: string) {
    pinnedId.value = pinnedId.value === tileId ? null : tileId;
  }
  // A pinned participant who leaves, or a pinned share that stops, lets go of the stage.
  watch(tiles, (current) => {
    if (pinnedId.value && !current.some((t) => t.id === pinnedId.value)) pinnedId.value = null;
  });

  const remoteCount = computed(() => participants.value.length - 1);

  const mode = computed<CallLayoutMode>(() => {
    if (pinnedId.value || newestScreen.value) return "stage";
    if (remoteCount.value <= 0) return "solo";
    if (remoteCount.value === 1) return "pair";
    return "grid";
  });

  const stageTile = computed<CallTileInfo | null>(() => {
    if (mode.value !== "stage") return null;
    const id = pinnedId.value ?? newestScreen.value;
    return tiles.value.find((t) => t.id === id) ?? null;
  });
  const stripTiles = computed(() =>
    mode.value === "stage" ? tiles.value.filter((t) => t.id !== stageTile.value?.id) : [],
  );
  const gridTiles = computed(() => (mode.value === "grid" ? cameraTiles.value : []));

  const orientation = computed<"portrait" | "landscape">(() =>
    height.value > width.value ? "portrait" : "landscape",
  );

  /**
   * The grid is always 2×2, so a phone's tiles stay large enough to recognise a face (SC-006).
   * With three tiles the last row holds one, centred, at the width of one cell.
   */
  const gridClass = "grid size-full grid-cols-2 grid-rows-2 gap-(--call-gap)";
  const cellClass = (index: number) =>
    gridTiles.value.length === 3 && index === 2
      ? "col-span-2 w-[calc(50%-var(--call-gap)/2)] justify-self-center"
      : "";

  /** Changes whenever tiles move between the stage, grid and strip (their <video> remounts). */
  const key = computed(
    () => `${mode.value}|${stageTile.value?.id ?? ""}|${tiles.value.map((t) => t.id).join()}`,
  );

  return {
    mode,
    tiles,
    gridTiles,
    stageTile,
    stripTiles,
    pinnedId,
    togglePin,
    orientation,
    gridClass,
    cellClass,
    key,
  };
}

export type CallLayout = ReturnType<typeof useCallLayout>;
