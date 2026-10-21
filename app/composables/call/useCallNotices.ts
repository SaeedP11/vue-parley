import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { Participant } from "./session";

/** How long a notice shows, and the window in which joins and leaves merge into it. */
const NOTICE_MS = 3_000;

export interface CallNotice {
  text: string;
  /** Changes with every new notice, so a view can restart its transition. */
  id: number;
}

/**
 * "Sara joined", "Nima left": a short notice when someone joins or leaves, with changes that come
 * close together merged into one ("Sara and Nima joined"). The people already there when the view
 * mounts are not announced. `liveText` carries the same words for an `aria-live` region.
 */
export function useCallNotices(
  participants: Ref<Participant[]>,
  t: (key: string, params: Record<string, unknown>, plural: number) => string,
  and: () => string,
  locale: () => string,
) {
  const current = ref<CallNotice | null>(null);
  const liveText = ref("");

  let joined: string[] = [];
  let left: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let counter = 0;

  const list = (names: string[]) => {
    if (names.length <= 1) return names[0] ?? "";
    const comma = locale().startsWith("fa") || locale().startsWith("ar") ? "، " : ", ";
    return `${names.slice(0, -1).join(comma)} ${and()} ${names[names.length - 1]}`;
  };

  function show() {
    const parts = [
      joined.length ? t("chat.call.joined", { names: list(joined) }, joined.length) : "",
      left.length ? t("chat.call.left", { names: list(left) }, left.length) : "",
    ].filter(Boolean);
    if (!parts.length) return;
    const text = parts.join(" · ");
    current.value = { text, id: ++counter };
    liveText.value = text;
    clearTimeout(timer);
    timer = setTimeout(() => {
      current.value = null;
      joined = [];
      left = [];
    }, NOTICE_MS);
  }

  watch(
    () => participants.value.filter((p) => !p.isSelf).map((p) => [p.id, p.name] as const),
    (now, before) => {
      if (!before) return; // whoever was already there when the view mounted
      const was = new Map(before);
      const is = new Map(now);
      let changed = false;
      for (const [id, name] of is) {
        if (was.has(id)) continue;
        // Back within the window (a dropped connection rebuilt): no news.
        const i = left.indexOf(name);
        if (i >= 0) left.splice(i, 1);
        else joined.push(name);
        changed = true;
      }
      for (const [id, name] of was) {
        if (is.has(id)) continue;
        // Joined and gone again within the window: only the leaving is news now.
        const i = joined.indexOf(name);
        if (i >= 0) joined.splice(i, 1);
        left.push(name);
        changed = true;
      }
      if (changed) {
        if (joined.length || left.length) show();
        else current.value = null;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => clearTimeout(timer));

  return { current, liveText };
}
