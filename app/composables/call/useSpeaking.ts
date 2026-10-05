import { onBeforeUnmount, reactive, watch } from "vue";

// RMS of the waveform (0–1) above which a voice counts as speaking, and how long it stays lit
// after dropping below, so the ring doesn't flicker between words.
const THRESHOLD = 0.04;
const HOLD_MS = 400;
const POLL_MS = 120;

interface Meter {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
  lastLoud: number;
}

/**
 * Who is speaking, per tile id: a level meter on each stream's audio, through one shared
 * AudioContext. Ids whose stream is null, or has no audio track, are never speaking.
 */
export function useSpeaking(streams: () => Record<string, MediaStream | null | undefined>) {
  const speaking = reactive<Record<string, boolean>>({});
  const meters = new Map<string, Meter>();
  let context: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const drop = (id: string) => {
    const meter = meters.get(id);
    if (!meter) return;
    meter.source.disconnect();
    meters.delete(id);
    delete speaking[id];
  };

  const poll = () => {
    const now = performance.now();
    for (const [id, meter] of meters) {
      meter.analyser.getByteTimeDomainData(meter.buffer);
      let sum = 0;
      for (const sample of meter.buffer) {
        const centred = (sample - 128) / 128;
        sum += centred * centred;
      }
      if (Math.sqrt(sum / meter.buffer.length) > THRESHOLD) meter.lastLoud = now;
      const lit = now - meter.lastLoud < HOLD_MS;
      if (speaking[id] !== lit) speaking[id] = lit;
    }
  };

  watch(
    streams,
    (current) => {
      for (const id of [...meters.keys()]) {
        if (current[id] !== meters.get(id)!.stream) drop(id);
      }

      for (const [id, stream] of Object.entries(current)) {
        if (!stream || meters.has(id) || !stream.getAudioTracks().length) continue;
        if (typeof AudioContext === "undefined") return;
        context ??= new AudioContext();
        // Created after the call was started by a click, so it is normally running already.
        if (context.state === "suspended") void context.resume().catch(() => {});

        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        // Only measured, never routed to the speakers: the <video> elements play the sound.
        source.connect(analyser);
        meters.set(id, {
          stream,
          source,
          analyser,
          buffer: new Uint8Array(analyser.fftSize),
          lastLoud: 0,
        });
      }

      if (meters.size && !timer) timer = setInterval(poll, POLL_MS);
      if (!meters.size && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    { immediate: true, deep: 1 },
  );

  onBeforeUnmount(() => {
    clearInterval(timer);
    for (const id of [...meters.keys()]) drop(id);
    void context?.close().catch(() => {});
  });

  return speaking;
}
