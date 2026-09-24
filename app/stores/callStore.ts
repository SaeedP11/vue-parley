import { defineStore, acceptHMRUpdate } from "pinia";
import { markRaw, ref, shallowRef } from "vue";
import type { CallHandlers } from "~/types";
import type { CallSession } from "~/composables/call/session";
import { useAppToast } from "~/composables/useAppToast";
import useLocalI18n from "~/composables/useLocalI18n";
import { useProfileStore } from "./profileStore";
import { chat } from "@i18n/locales";

export const useCallStore = defineStore("call-modal", () => {
  // Created in a component's setup (like the messages store): translations need it.
  const { t } = useLocalI18n(chat);
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

  const startCall = (id: string) => {
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
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCallStore, import.meta.hot));
}
