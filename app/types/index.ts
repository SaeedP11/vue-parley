/**
 * A WebRTC signalling payload: an SDP offer/answer or an ICE candidate. Mirrors simple-peer's
 * `SignalData`, declared here so the public types don't depend on @types/simple-peer.
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
export interface Message {
  id: string;
  conversationId: string;
  date: Date;
  type: MessageType;
  text?: string;
  imageUrl?: string[];
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

export interface MessagesHandlers {
  sendMessage(msg: Message, opts?: SendMessageOptions): Promise<Message>;
  editMessage(id: string, text: string): Promise<Message>;
  deleteMessages(ids: string[]): Promise<void>;
  fetchMessages(params: FetchMessagesParams): Promise<Message[]>;
  /** Persists that the viewer has read a conversation. Optional; without it read state stays local. */
  markRead?(conversationId: string): Promise<void>;
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
    };
