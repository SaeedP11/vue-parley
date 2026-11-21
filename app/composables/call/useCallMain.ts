import { computed, reactive, watch } from "vue";
import type { CallSession } from "./session";

/** The main view shows a participant (their id), their shared screen (`screen:<id>`), or whiteboard (`whiteboard:<id>`). */
export const screenKey = (id: string) => `screen:${id}`;
export const whiteboardKey = (id: string) => `whiteboard:${id}`;
export const isScreenKey = (key: string) => key.startsWith("screen:");
export const isWhiteboardKey = (key: string) => key.startsWith("whiteboard:");

interface MainState {
  key?: string;
  /** Picked by the user: it stays in the main view until they pick something else or it ends. */
  picked: boolean;
  presenters: string[];
}
// One per call, so the stage and the minimized card show the same thing.
const states = new WeakMap<object, MainState>();

/** Who or which media is in the main view. A newly started share takes it unless the user picked. */
export function useCallMain(session: CallSession, featuredId: () => string | undefined) {
  let state = states.get(session);
  if (!state) {
    state = reactive<MainState>({ picked: false, presenters: [] });
    states.set(session, state);
  }
  const s = state;

  const participants = computed(() => session.participants.value);
  const presenters = computed(() => participants.value.filter((person) => !!person.screen?.getVideoTracks().length));
  const whiteboardPresenters = computed(() =>
    participants.value.filter((person) => !!person.whiteboard?.getVideoTracks().length),
  );

  watch(
    [participants, featuredId],
    () => {
      const ids = participants.value.map((person) => person.id);
      const screenKeys = presenters.value.map((p) => screenKey(p.id));
      const whiteboardKeys = whiteboardPresenters.value.map((p) => whiteboardKey(p.id));
      const allSharingKeys = [...screenKeys, ...whiteboardKeys];
      const started = allSharingKeys.filter((key) => !s.presenters.includes(key));
      s.presenters = allSharingKeys;
      const valid = new Set([...ids, ...allSharingKeys]);
      const counterpart =
        ids.find((id) => id === featuredId()) ?? participants.value.find((person) => !person.isSelf)?.id;
      const current = s.key && valid.has(s.key) ? s.key : undefined;

      if (started.length && !(s.picked && current)) {
        s.picked = false;
        s.key = started.at(-1)!;
      } else if (!current) {
        s.picked = false;
        s.key = allSharingKeys.length ? allSharingKeys.at(-1)! : (counterpart ?? ids[0]);
      } else if (!s.picked && !isScreenKey(current) && !isWhiteboardKey(current) && counterpart && current !== counterpart) {
        s.key = counterpart;
      }
    },
    { immediate: true },
  );

  const key = computed(() => s.key);
  const screenOwner = computed(() => presenters.value.find((person) => screenKey(person.id) === s.key));
  const whiteboardOwner = computed(() =>
    whiteboardPresenters.value.find((person) => whiteboardKey(person.id) === s.key),
  );
  const person = computed(() => participants.value.find((p) => p.id === s.key));
  const pick = (next: string) => {
    s.key = next;
    s.picked = true;
  };
  return { key, presenters, whiteboardPresenters, screenOwner, whiteboardOwner, person, pick };
}
