import type { SignalData } from "simple-peer";

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

export const enum CallMessageType {
  Signal = "signal",
  Join = "join",
  TrackType = "track_type",
  Call = "call",
  Hangup = "hangup",
}

export type TrackType = "webcam" | "screen" | "audio" | "webcam_audio";

export type CallMessageSchema =
  | {
      type: CallMessageType.Signal;
      payload: {
        signal: SignalData & { sdp: string };
        from: string;
        to: string;
        name: string;
      };
    }
  | {
      type: CallMessageType.Join;
      payload: {
        from: string;
        name: string;
      };
    }
  | {
      type: CallMessageType.TrackType;
      payload: {
        from: string;
        types: { id: string; type: TrackType }[];
      };
    }
  | {
      type: CallMessageType.Call;
      payload: {
        from: string;
        name: string;
        channel: string;
        avatar: string;
      };
    }
  | {
      type: CallMessageType.Hangup;
      payload: {
        from: string;
        channel: string;
      };
    };
