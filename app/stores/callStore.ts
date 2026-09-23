import { defineStore, acceptHMRUpdate } from "pinia";

export const useCallStore = defineStore("call-modal", () => {
  const timerInterval = ref<NodeJS.Timeout | null>(null);
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
    // A mounted call keeps its peers, so re-targeting it would split its signalling.
    if (isActive.value) {
      isMinimized.value = false;
      return;
    }
    startTimer();
    channelId.value = id;
    isActive.value = true;
    isMinimized.value = false;
  };

  const endCall = () => {
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
    isActive,
    isMinimized,
    elapsedTime,
    channelId,
    startCall,
    endCall,
    minimize,
    maximize,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCallStore, import.meta.hot));
}
