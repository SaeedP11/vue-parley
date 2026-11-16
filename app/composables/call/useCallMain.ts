import { computed, reactive, watch } from "vue";
import type { CallSession } from "./session";

/** The main view shows a participant (their id) or someone's shared screen (`screen:<id>`). */
export const screenKey = (id: string) => `screen:${id}`;
const isScreenKey = (key: string) => key.startsWith("screen:");

interface MainState {
  key?: string;
  /** Picked by the user: it stays in the main view until they pick something else or it ends. */
  picked: boolean;
  presenters: string[];
}
// One per call, so the stage and the minimized card show the same thing.
const states = new WeakMap<object, MainState>();

/** Who or which screen is in the main view. A newly started share takes it unless the user picked. */
export function useCallMain(session: CallSession, featuredId: () => string | undefined) {
  let state = states.get(session);
  if (!state) {
    state = reactive<MainState>({ picked: false, presenters: [] });
    states.set(session, state);
  }
  const s = state;

  const participants = computed(() => session.participants.value);
  const presenters = computed(() => participants.value.filter((person) => !!person.screen?.getVideoTracks().length));

  watch(
    [participants, featuredId],
    () => {
      const ids = participants.value.map((person) => person.id);
      const sharing = presenters.value.map((person) => person.id);
      const started = sharing.filter((id) => !s.presenters.includes(id));
      s.presenters = sharing;
      const valid = new Set([...ids, ...sharing.map(screenKey)]);
      const counterpart =
        ids.find((id) => id === featuredId()) ?? participants.value.find((person) => !person.isSelf)?.id;
      const current = s.key && valid.has(s.key) ? s.key : undefined;

      if (started.length && !(s.picked && current)) {
        s.picked = false;
        s.key = screenKey(started.at(-1)!);
      } else if (!current) {
        s.picked = false;
        s.key = sharing.length ? screenKey(sharing.at(-1)!) : (counterpart ?? ids[0]);
      } else if (!s.picked && !isScreenKey(current) && counterpart && current !== counterpart) {
        s.key = counterpart;
      }
    },
    { immediate: true },
  );

  const key = computed(() => s.key);
  const screenOwner = computed(() => presenters.value.find((person) => screenKey(person.id) === s.key));
  const person = computed(() => participants.value.find((p) => p.id === s.key));
  const pick = (next: string) => {
    s.key = next;
    s.picked = true;
  };
  return { key, presenters, screenOwner, person, pick };
}
