// @ts-nocheck — grandfathered legacy chat-tree type errors; lift incrementally
// composables/useChatRecording.ts
import { ref, computed, onBeforeUnmount, type Ref } from "vue";

export function useChatRecording(
  inputWidth: Ref<number | undefined>,
  callbacks: {
    onStart: () => void;
    onCancel: () => void;
    onSend?: (mediaUrl?: string) => void;
    requestPermission: () => Promise<boolean>;
    getMode?: () => "video" | "voice";
  },
) {
  const isRecording = ref(false);
  const isLocked = ref(false);
  const isPaused = ref(false);
  const recordingTime = ref(0);
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  const mediaStream = ref<MediaStream | null>(null);
  let mediaRecorder: MediaRecorder | null = null;
  const recordedChunks: Blob[] = [];
  const currentFacingMode = ref<"user" | "environment">("user");

  const pickRecorderMime = (isVideo: boolean) => {
    const candidates = isVideo
      ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (const c of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(c)
      )
        return c;
    }
    return isVideo ? "video/webm" : "audio/webm";
  };

  const startRecorder = () => {
    const stream = mediaStream.value;
    if (!stream || typeof MediaRecorder === "undefined") return;
    recordedChunks.length = 0;
    const isVideo = stream.getVideoTracks().length > 0;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: pickRecorderMime(isVideo),
      });
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) {
        console.error("Failed to create MediaRecorder:", err);
        return;
      }
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) recordedChunks.push(event.data);
    };
    recorder.start(250);
    mediaRecorder = recorder;
  };

  const stopStream = () => {
    if (mediaStream.value) {
      mediaStream.value.getTracks().forEach((t) => t.stop());
      mediaStream.value = null;
    }
  };

  const finalizeAndSend = () => {
    const chunks = recordedChunks.slice();
    const mimeType =
      (mediaRecorder && mediaRecorder.mimeType) ||
      (chunks.length ? chunks[0].type : "video/webm");
    mediaRecorder = null;
    recordedChunks.length = 0;
    stopStream();
    if (chunks.length === 0) {
      callbacks.onCancel();
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      callbacks.onCancel();
      return;
    }
    callbacks.onSend?.(URL.createObjectURL(blob));
  };

  const toggleCamera = async () => {
    if (!mediaStream.value || !isRecording.value) return;
    currentFacingMode.value =
      currentFacingMode.value === "user" ? "environment" : "user";

    const oldTrack = mediaStream.value.getVideoTracks()[0];
    if (oldTrack) oldTrack.stop();

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode.value },
      });
      if (mediaStream.value && newStream.getVideoTracks()[0]) {
        mediaStream.value.removeTrack(oldTrack);
        mediaStream.value.addTrack(newStream.getVideoTracks()[0]);
      }
    } catch (err) {
      console.error("Failed to flip camera:", err);
    }
  };

  // Drag State
  const isDragging = ref(false);
  const startX = ref(0);
  const startY = ref(0);
  const dragOffset = ref({ x: 0, y: 0 });
  const dragAxis = ref<"x" | "y" | null>(null);

  const pressTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const isPointerDown = ref(false);
  const isLongPress = ref(false);

  const formattedTime = computed(() => {
    const m = Math.floor(recordingTime.value / 60)
      .toString()
      .padStart(2, "0");
    const s = (recordingTime.value % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  });

  const lockOpacity = computed(() => (dragAxis.value === "x" ? 0 : 1));
  const cancelOpacity = computed(() =>
    dragAxis.value === "y"
      ? 1
      : 1 - Math.min(Math.abs(dragOffset.value.x) / 80, 1),
  );

  const resetDrag = () => {
    isDragging.value = false;
    dragOffset.value = { x: 0, y: 0 };
    dragAxis.value = null;
  };

  const togglePause = () => {
    isPaused.value = !isPaused.value;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        if (isPaused.value) mediaRecorder.pause();
        else mediaRecorder.resume();
      } catch {
        // ignore — recorder pause/resume best-effort
      }
    }
    if (!isPaused.value) {
      timerInterval = setInterval(() => recordingTime.value++, 1000);
    } else if (timerInterval) {
      clearInterval(timerInterval);
    }
  };

  const stopRecording = (triggerSend = false) => {
    if (timerInterval) clearInterval(timerInterval);
    isRecording.value = false;
    isLocked.value = false;
    isPaused.value = false;
    recordingTime.value = 0;
    resetDrag();

    const recorder = mediaRecorder;
    if (triggerSend && recorder && recorder.state !== "inactive") {
      recorder.onstop = finalizeAndSend;
      try {
        recorder.stop();
      } catch {
        finalizeAndSend();
      }
      return;
    }
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorder = null;
    recordedChunks.length = 0;
    stopStream();
    callbacks.onCancel();
  };

  const onPointerDown = (event: PointerEvent) => {
    isPointerDown.value = true;
    isLongPress.value = false;
    startX.value = event.clientX;
    startY.value = event.clientY;
    resetDrag();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    if (pressTimer.value) clearTimeout(pressTimer.value);

    pressTimer.value = setTimeout(async () => {
      isLongPress.value = true;
      // Await the permission UI
      const hasPermission = await callbacks.requestPermission();

      if (hasPermission && isPointerDown.value) {
        isDragging.value = true;
        isRecording.value = true;
        isPaused.value = false;
        recordingTime.value = 0;
        callbacks.onStart();
        timerInterval = setInterval(() => recordingTime.value++, 1000);

        try {
          const isVideo = !callbacks.getMode || callbacks.getMode() === "video";
          mediaStream.value = await navigator.mediaDevices.getUserMedia({
            video: isVideo ? { facingMode: currentFacingMode.value } : false,
            audio: true,
          });
          startRecorder();
        } catch (err) {
          console.error("Stream failed", err);
        }
      }
    }, 400);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isRecording.value || isLocked.value || !isDragging.value) return;

    const deltaX = event.clientX - startX.value;
    const deltaY = event.clientY - startY.value;

    if (!dragAxis.value) {
      if (deltaY < -10) dragAxis.value = "y";
      else if (deltaX < -10) dragAxis.value = "x";
    }

    if (dragAxis.value === "y") {
      dragOffset.value.y = Math.max(-100, Math.min(0, deltaY));
      if (dragOffset.value.y <= -60) {
        isLocked.value = true;
        resetDrag();
      }
    } else if (dragAxis.value === "x") {
      const cancelThreshold = inputWidth.value ? inputWidth.value / 3 : 150;
      dragOffset.value.x = Math.max(-cancelThreshold, Math.min(0, deltaX));
      if (deltaX <= -cancelThreshold) stopRecording(false);
    }
  };

  const onPointerUp = () => {
    isPointerDown.value = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    if (pressTimer.value) {
      clearTimeout(pressTimer.value);
      pressTimer.value = null;
    }

    if (isRecording.value && !isLocked.value) {
      if (dragAxis.value === "x") stopRecording(false);
      else stopRecording(true);
    }
    resetDrag();
  };

  // Release the MediaStream and stop the timer if the host component
  // unmounts mid-recording (e.g. route change while recording).
  onBeforeUnmount(() => {
    if (pressTimer.value) {
      clearTimeout(pressTimer.value);
      pressTimer.value = null;
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    if (isRecording.value) stopRecording(false);
  });

  return {
    isRecording,
    isLocked,
    isPaused,
    formattedTime,
    dragOffset,
    isDragging,
    lockOpacity,
    cancelOpacity,
    isLongPress,
    onPointerDown,
    mediaStream,
    toggleCamera,
    togglePause,
    stopRecording,
  };
}
