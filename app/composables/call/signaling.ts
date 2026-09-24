import type {
  CallHandlers,
  CallMessageSchema,
  SignalData,
  TrackType,
} from "~/types";
import { CallMessageType } from "~/types";

export type TrackTypes = { id: string; type: TrackType }[];

export interface SignalingHandlers {
  /** An SDP offer/answer or ICE candidate addressed to us. */
  onSignal(from: string, name: string, signal: SignalData & { sdp: string }): void;
  /** Someone entered the call. */
  onJoin(from: string, name: string): void;
  /** Someone described which of their streams are camera, screen, … */
  onTrackTypes(from: string, types: TrackTypes): void;
  /** Someone left the call. */
  onHangup(from: string): void;
}

/**
 * The call's messages over the host's pub/sub (`CallHandlers`), typed. Knows nothing about
 * WebRTC: it only turns calls into messages and messages into callbacks.
 */
export function createSignaling(
  handlers: Pick<CallHandlers, "publisher" | "subscriber" | "unSubscriber">,
  self: { id: string; name: () => string },
) {
  let subscription: number | undefined;

  const publish = (message: CallMessageSchema) =>
    handlers.publisher(JSON.stringify(message));

  async function listen(on: SignalingHandlers) {
    subscription = await handlers.subscriber(async (message) => {
      const from = message.payload.from;
      if (from === self.id) return;

      switch (message.type) {
        case CallMessageType.Signal:
          if (message.payload.to === self.id && message.payload.signal)
            on.onSignal(from, message.payload.name, message.payload.signal);
          break;
        case CallMessageType.Join:
          on.onJoin(from, message.payload.name);
          break;
        case CallMessageType.TrackType:
          on.onTrackTypes(from, message.payload.types);
          break;
        case CallMessageType.Hangup:
          on.onHangup(from);
          break;
      }
    });
  }

  function stop() {
    if (subscription !== undefined) void handlers.unSubscriber(subscription);
    subscription = undefined;
  }

  return {
    listen,
    stop,
    join: () =>
      publish({
        type: CallMessageType.Join,
        payload: { from: self.id, name: self.name() },
      }),
    trackTypes: (types: TrackTypes) =>
      publish({
        type: CallMessageType.TrackType,
        payload: { from: self.id, types },
      }),
    signal: (to: string, signal: SignalData) =>
      publish({
        type: CallMessageType.Signal,
        payload: {
          from: self.id,
          to,
          name: self.name(),
          signal: signal as SignalData & { sdp: string },
        },
      }),
    /** Rings the other side of `channel`. */
    ring: (channel: string, avatar?: string) =>
      publish({
        type: CallMessageType.Call,
        payload: { from: self.id, name: self.name(), channel, avatar: avatar ?? "" },
      }),
    hangup: (channel: string) =>
      publish({
        type: CallMessageType.Hangup,
        payload: { from: self.id, channel },
      }),
  };
}

export type Signaling = ReturnType<typeof createSignaling>;
