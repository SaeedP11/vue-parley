import { defineStore, acceptHMRUpdate } from "pinia";
import { markRaw, ref, shallowRef } from "vue";
import { CallMessageType, type CallHandlers, type CallMessageSchema } from "~/types";
import type { CallSession } from "~/composables/call/session";
import { useAppToast } from "~/composables/useAppToast";
import { useStoreI18n } from "~/composables/useHostI18n";
import { useProfileStore } from "./profileStore";
import { chat } from "@i18n/locales";

export const useCallStore = defineStore("call-modal", () => {
  const { t } = useStoreI18n(chat);
  const { openToast } = useAppToast();
  const profileStore = useProfileStore();

  let handlers: CallHandlers | null = null;
  function setHandlers(val: CallHandlers) {
    handlers = val;
  }

  /**
   * The running call. Lives here, not in a component, so it survives the call view unmounting.
   * Null until its code has loaded: calling is fetched on first use.
   */
  const session = shallowRef<CallSession | null>(null);
  /** Bumped on every start/end, so a slow load can tell it was overtaken. */
  let attempt = 0;

  const timerInterval = ref<ReturnType<typeof setInterval> | null>(null);
  const channelId = ref<string | null>(null);
  const startTime = ref<number | null>(null);
  const isMinimized = ref(false);
  const isActive = ref(false);
  const elapsedTime = ref(0);

  const stopTimer = () => {
    if (timerInterval.value) clearInterval(timerInterval.value);
    timerInterval.value = null;
    startTime.value = null;
  };

  const startTimer = () => {
    stopTimer();
    startTime.value = Date.now();
    timerInterval.value = setInterval(() => {
      elapsedTime.value = Math.floor(
        (Date.now() - (startTime.value || 0)) / 1000,
      );
    }, 1000);
  };

  /** Starts a call in conversation `id`; `video: false` joins with the camera off. */
  const startCall = (id: string, { video = true }: { video?: boolean } = {}) => {
    // One call at a time; asking again just brings the running one back into view.
    if (isActive.value) {
      isMinimized.value = false;
      return;
    }
    if (!handlers) {
      throw new Error(
        "[vue-chat] No call handlers: pass `call` to createChat() or use provideCallHandlers()",
      );
    }

    const callHandlers = handlers;
    const current = ++attempt;
    startTimer();
    channelId.value = id;
    isActive.value = true;
    isMinimized.value = false;

    void import("~/composables/call/session").then(({ createCallSession }) => {
      if (current !== attempt) return; // ended or restarted while loading
      const call = createCallSession({
        handlers: callHandlers,
        channel: id,
        self: {
          id: profileStore.userId,
          name: () => profileStore.userName ?? "",
          avatar: () => profileStore.userAvatar,
        },
        notify: (key) => openToast(t(key), "error"),
        video,
      });
      // Streams and connections inside must not be made deeply reactive.
      session.value = markRaw(call);
      void call.start();
    });
  };

  const endCall = () => {
    attempt++;
    session.value?.end();
    session.value = null;
    stopTimer();
    isActive.value = false;
    isMinimized.value = false;
    elapsedTime.value = 0;
    channelId.value = null;
  };

  const minimize = () => {
    isMinimized.value = true;
  };

  const maximize = () => {
    isMinimized.value = false;
  };

  /**
   * Calls running in conversations, as heard from their signalling: channel → the signalling id
   * of each participant → when they count as gone unless heard from again.
   */
  const ongoing = ref<Record<string, Record<string, { until: number; video?: boolean }>>>({});
  let sweepTimer: ReturnType<typeof setInterval> | undefined;

  const sweep = () => {
    const now = Date.now();
    for (const [channel, members] of Object.entries(ongoing.value)) {
      for (const [from, member] of Object.entries(members)) {
        if (member.until <= now) delete members[from];
      }
      if (!Object.keys(members).length) delete ongoing.value[channel];
    }
    if (!Object.keys(ongoing.value).length) {
      clearInterval(sweepTimer);
      sweepTimer = undefined;
    }
  };

  /**
   * Feeds the store a call message heard on a conversation's channel, so the header can offer to
   * join a call others are in. Hosts call it for every call message on every conversation the
   * user belongs to, not only the open one. `channel` defaults to the payload's own (`join`,
   * `signal` and `track_type` carry none). The user's own messages are ignored.
   */
  const observeCall = (
    message: CallMessageSchema,
    channel = "channel" in message.payload ? message.payload.channel : undefined,
  ) => {
    // Signalling ids are `<user id>:<suffix>`; `<user>:declined` is a ring turned down rather than
    // someone leaving, and `<user>:ring` a host's ring sent before the caller's session is up.
    const from = message.payload.from;
    const [user, suffix] = from.split(":");
    if (!channel || !user || user === profileStore.userId || suffix === "declined") return;

    if (message.type === CallMessageType.Hangup) {
      const members = ongoing.value[channel];
      if (!members) return;
      delete members[from];
      delete members[`${user}:ring`];
      if (!Object.keys(members).length) delete ongoing.value[channel];
      return;
    }

    const members = (ongoing.value[channel] ??= {});
    // Three missed presence beats. A message other than presence also counts, for clients that
    // send none.
    const until = Date.now() + 45_000;
    const video = message.type === CallMessageType.Presence ? message.payload.video : members[from]?.video;
    members[from] = { until, video };
    sweepTimer ??= setInterval(sweep, 5_000);
  };

  /** The call others are in on conversation `id`, if any: whether it is a video call. */
  const ongoingCall = (id: string | null | undefined) => {
    const members = id ? ongoing.value[id] : undefined;
    if (!members || !Object.keys(members).length) return null;
    return { video: Object.values(members).some((m) => m.video) };
  };

  /** Ends a running call and forgets the calls heard of elsewhere, for the next signed-in user. */
  const reset = () => {
    endCall();
    clearInterval(sweepTimer);
    sweepTimer = undefined;
    ongoing.value = {};
  };

  return {
    session,
    isActive,
    isMinimized,
    elapsedTime,
    channelId,
    setHandlers,
    startCall,
    endCall,
    minimize,
    maximize,
    observeCall,
    ongoingCall,
    reset,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCallStore, import.meta.hot));
}
