/**
 * A WebRTC signalling payload: an SDP offer/answer, an ICE candidate, or a request for the
 * initiator to renegotiate. The same shape simple-peer uses, so clients on the previous,
 * simple-peer based build still interoperate.
 */
export interface SignalData {
  type?: "transceiverRequest" | "renegotiate" | "candidate" | RTCSdpType;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  renegotiate?: boolean;
  transceiverRequest?: { kind: string; init?: RTCRtpTransceiverInit };
}

export type ThemeMode = "light" | "dark";

export interface CallMember extends Contact {
  stream: MediaStream | null;
  isScreenSharing: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
}

export type status = "pending" | "approved" | "rejected" | "expired";
export type ServicePresence = "online" | "on-site";
export type UserRoleKey = "user" | "employee" | "business" | "support";
export type StateKeys = "" | "online" | "ended" | "active";
export type MessageType = "text" | "image" | "file" | "voice" | "video";

/** One photo or video of an album. */
export interface MediaItem {
  url: string;
  kind: "image" | "video";
}

export interface Message {
  id: string;
  conversationId: string;
  date: Date;
  type: MessageType;
  text?: string;
  /** Photos of an album. A host that also sends videos uses `media` instead. */
  imageUrl?: string[];
  /**
   * The album's photos and videos, in order, on a message of type `image`. Takes precedence over
   * `imageUrl`, which senders still fill with just the photos. A round video note is `videoUrl`.
   */
  media?: MediaItem[];
  fileUrl?: string;
  fileName?: string;
  voiceUrl?: string;
  videoUrl?: string;
  isEdited: boolean;
  senderId: string;
  isSent: boolean;
  /** Set when the last send attempt failed, so the bubble can offer a retry. */
  isFailed?: boolean;
  isRead: boolean;
  repliedTo?: Message;
  request?: string;
}

export interface Contact {
  id: string;
  name: string;
  lastName: string;
  isOnline: boolean;
  /** Omit when unknown; the header then hides the "last seen" line. */
  lastSeen?: Date;
  imageUrl: string;
  nationalCode?: string;
  phoneNumber?: string;
  isActive: boolean;
  birthDate: Date;
  lastMessage?: Message;
  /**
   * When the conversation last changed. The row shows it, and the lists sort by it, when there is
   * no `lastMessage`.
   */
  lastActivity?: Date;
  /**
   * A short label on the row that tells conversations with the same person apart, such as the
   * service it is about.
   */
  tag?: string;
  unreadCount?: number;
  serviceType?: "video-call" | "voice-call" | "chat";
  userType: UserRoleKey[];
}

export interface ChatFilter {
  key: StateKeys;
  label: string;
}

export interface ExtendedMessage extends Message {
  prevMessage?: Message;
  nextMessage?: Message;
  isFirstInDate: boolean;
  contact?: Contact;
}

export interface ChatProvider {
  fetchContacts: () => Promise<Contact[]>;
}

export type CallKind = "voice-call" | "video-call";

export type CallMessage =
  | {
      type: "signal";
      payload: {
        signal: SignalData & { sdp: string };
        from: string;
        to: string;
        name: string;
      };
    }
  | { type: "join"; payload: { from: string; name: string } }
  | {
      type: "track_type";
      payload: { from: string; types: { id: string; type: TrackType }[] };
    }
  | {
      type: "call";
      payload: {
        from: string;
        name: string;
        channel: string;
        avatar?: string;
      };
    }
  | {
      type: "hangup";
      payload: { from: string; channel: string; name?: string };
    };

export interface TurnConfig {
  urls: string[];
  username?: string;
  credential?: string;
  iceTransportPolicy?: "relay" | "all";
}

export interface CallPublishOptions {
  retain?: boolean;
}

export type Credential = {
  ttl: number;
  user: string;
  pass: string;
  urls: string[];
};

export interface CallHandlers {
  credential: Credential;
  handleGenerateCred: () => Promise<void>;
  publisher: (json: string) => Promise<void>;
  subscriber: (
    callback: (message: CallMessageSchema) => Promise<void>,
  ) => Promise<number>;
  unSubscriber: (id: number) => Promise<void>;
  /**
   * "relay" (the default) sends media only through the TURN servers in `credential`. "all" also
   * allows direct connections, and works without TURN servers (e.g. on a LAN or in tests).
   */
  iceTransportPolicy?: RTCIceTransportPolicy;
  /** Logs signalling and peer events to the console. */
  debug?: boolean;
}

export interface FetchContactsParams {
  page: number;
  pageSize: number;
  state: StateKeys;
  search?: string;
}

export interface ContactsPage {
  data: Contact[];
  hasNextPage: boolean;
}

export interface ChatHandlers {
  fetchConversations(params: FetchContactsParams): Promise<ContactsPage>;
  deleteConversation(id: string): Promise<void>;
  /** Optional; the "end conversation" action is only offered when provided. */
  endConversation?(id: string): Promise<void>;
}

export interface MediaDownloadOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface MediaHandlers {
  download(url: string, opts?: MediaDownloadOptions): Promise<Blob>;
  getFileSize(url: string): Promise<number | null>;
}

export interface UploadProgressEvent {
  uploaded: number;
  total: number;
  progress: number;
}

export interface SendMessageOptions {
  onProgress?: (e: UploadProgressEvent) => void;
}

export interface FetchMessagesParams {
  conversationId: string;
  page: number;
  pageSize: number;
}

/** Someone who has read one of the viewer's messages. */
export interface MessageReader {
  /** The reader's user id. */
  id: string;
  name: string;
  lastName?: string;
  imageUrl?: string;
  /**
   * When the reader last caught up on the conversation. That is when they read the newest message
   * they have seen, so for an older message it can be later than when they actually read it.
   */
  readAt?: Date;
}

export interface MessagesHandlers {
  sendMessage(msg: Message, opts?: SendMessageOptions): Promise<Message>;
  editMessage(id: string, text: string): Promise<Message>;
  deleteMessages(ids: string[]): Promise<void>;
  fetchMessages(params: FetchMessagesParams): Promise<Message[]>;
  /**
   * Persists that the viewer has read a conversation, up to `lastMessageId` when one is loaded.
   * Called when a conversation opens and again as messages from others arrive while it is on
   * screen. Optional; without it read state stays local.
   */
  markRead?(conversationId: string, lastMessageId?: string): Promise<void>;
  /**
   * Who among the other participants has read one of the viewer's own messages. Optional; when
   * given, the message menu lists them ("Seen by").
   */
  fetchReaders?(message: Message): Promise<MessageReader[]>;
}

export interface FetchProfileAttachmentsParams {
  conversationId: string;
  page: number;
  pageSize: number;
}

export interface ProfileAttachmentsPage {
  data: string[];
  hasNextPage: boolean;
}

export interface ProfileHandlers {
  fetchMedia(
    params: FetchProfileAttachmentsParams,
  ): Promise<ProfileAttachmentsPage>;
  fetchFiles(
    params: FetchProfileAttachmentsParams,
  ): Promise<ProfileAttachmentsPage>;
}

// A plain object rather than a `const enum`, which consumers compiling with isolatedModules or
// erasableSyntaxOnly can't use from a .d.ts.
export const CallMessageType = {
  Signal: "signal",
  Join: "join",
  TrackType: "track_type",
  Call: "call",
  Hangup: "hangup",
  Presence: "presence",
} as const;
export type CallMessageType = (typeof CallMessageType)[keyof typeof CallMessageType];

export type TrackType = "webcam" | "screen" | "audio" | "webcam_audio";

export type CallMessageSchema =
  | {
      type: typeof CallMessageType.Signal;
      payload: {
        signal: SignalData & { sdp: string };
        from: string;
        to: string;
        name: string;
      };
    }
  | {
      type: typeof CallMessageType.Join;
      payload: {
        from: string;
        name: string;
        /** The sender dropped its connection to everyone: discard yours to it and reconnect. */
        restart?: boolean;
      };
    }
  | {
      type: typeof CallMessageType.TrackType;
      payload: {
        from: string;
        types: { id: string; type: TrackType }[];
      };
    }
  | {
      type: typeof CallMessageType.Call;
      payload: {
        from: string;
        name: string;
        channel: string;
        avatar: string;
      };
    }
  | {
      type: typeof CallMessageType.Hangup;
      payload: {
        from: string;
        channel: string;
      };
    }
  | {
      /**
       * Sent by everyone in a call when they join and then every 15 seconds while they stay, so
       * members outside it can tell a call is running and join it (`callStore.observeCall`).
       */
      type: typeof CallMessageType.Presence;
      payload: {
        from: string;
        channel: string;
        /** Whether the sender started it as a video call rather than a voice call. */
        video: boolean;
      };
    };
