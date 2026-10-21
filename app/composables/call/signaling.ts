import type {
  CallHandlers,
  CallMediaState,
  CallMessageSchema,
  SignalData,
  TrackType,
} from "~/types";
import { CallMessageType } from "~/types";

export type TrackTypes = { id: string; type: TrackType }[];

export interface JoinInfo {
  /** The sender dropped its connection to us and wants to set it up again. */
  restart: boolean;
  /** Who a `restart` is for; absent from older clients, whose restart is for everyone. */
  to?: string;
  joinedAt?: number;
}

export interface SignalingHandlers {
  /** An SDP offer/answer or ICE candidate addressed to us. */
  onSignal(from: string, name: string, signal: SignalData & { sdp: string }): void;
  /** Someone entered the call, or (`restart`) wants to set up their connection to us again. */
  onJoin(from: string, name: string, info: JoinInfo): void;
  /** Someone described which of their streams are camera, screen, …, and their mic and camera. */
  onTrackTypes(
    from: string,
    types: TrackTypes,
    info: { media?: CallMediaState; joinedAt?: number },
  ): void;
  /** Someone left the call. */
  onHangup(from: string): void;
  /** Someone in the call said they still are (every `PRESENCE_INTERVAL`). */
  onPresence?(from: string, joinedAt?: number): void;
}

/**
 * The call's messages over the host's pub/sub (`CallHandlers`), typed. Knows nothing about
 * WebRTC: it only turns calls into messages and messages into callbacks.
 *
 * Fields added after 5.0 (`to`, `joinedAt`, `media`) are optional and only sent when set, so
 * older clients, which ignore unknown fields, keep working.
 */
export function createSignaling(
  handlers: Pick<CallHandlers, "publisher" | "subscriber" | "unSubscriber">,
  self: { id: string; name: () => string; joinedAt: () => number | undefined },
) {
  let subscription: number | undefined;

  const publish = (message: CallMessageSchema) =>
    handlers.publisher(JSON.stringify(message));

  const joinedAt = () => {
    const at = self.joinedAt();
    return at === undefined ? {} : { joinedAt: at };
  };

  async function listen(on: SignalingHandlers) {
    subscription = await handlers.subscriber(async (message) => {
      const from = message.payload.from;
      if (from === self.id) return;

      switch (message.type) {
        case CallMessageType.Signal:
          if (message.payload.to === self.id && message.payload.signal)
            on.onSignal(from, message.payload.name, message.payload.signal);
          break;
        case CallMessageType.Join: {
          const { restart, to, joinedAt } = message.payload;
          // A restart aimed at someone else: their pair with the sender rebuilds, ours is fine.
          if (restart && to && to !== self.id) return;
          on.onJoin(from, message.payload.name, { restart: !!restart, to, joinedAt });
          break;
        }
        case CallMessageType.TrackType:
          on.onTrackTypes(from, message.payload.types, {
            media: message.payload.media,
            joinedAt: message.payload.joinedAt,
          });
          break;
        case CallMessageType.Hangup:
          on.onHangup(from);
          break;
        case CallMessageType.Presence:
          on.onPresence?.(from, message.payload.joinedAt);
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
    join: ({ restart = false, to }: { restart?: boolean; to?: string } = {}) =>
      publish({
        type: CallMessageType.Join,
        payload: {
          from: self.id,
          name: self.name(),
          ...(restart && { restart }),
          ...(to && { to }),
          ...joinedAt(),
        },
      }),
    trackTypes: (types: TrackTypes, media?: CallMediaState) =>
      publish({
        type: CallMessageType.TrackType,
        payload: { from: self.id, types, ...(media && { media }), ...joinedAt() },
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
    /** Tells members outside the call that we are in it. */
    presence: (channel: string, video: boolean) =>
      publish({
        type: CallMessageType.Presence,
        payload: { from: self.id, channel, video, ...joinedAt() },
      }),
    hangup: (channel: string) =>
      publish({
        type: CallMessageType.Hangup,
        payload: { from: self.id, channel },
      }),
  };
}

export type Signaling = ReturnType<typeof createSignaling>;
