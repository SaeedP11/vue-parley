import type { CallHandlers } from "~/types";

/** The default cap on participants (`CallHandlers.maxParticipants`). */
export const DEFAULT_MAX_PARTICIPANTS = 4;

/** The cap a host asked for, never below 2: a call of one is no call. */
export const maxParticipantsOf = (handlers: Pick<CallHandlers, "maxParticipants"> | null) =>
  Math.max(2, handlers?.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS);

/**
 * The order every client agrees on: by when they joined, then by signalling id. Whoever ranks
 * past the cap is the one to leave (contracts/signalling.md). Unknown join times (older
 * clients) order last.
 */
export const byJoinOrder = (
  a: { id: string; joinedAt?: number },
  b: { id: string; joinedAt?: number },
) =>
  (a.joinedAt ?? Infinity) - (b.joinedAt ?? Infinity) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
