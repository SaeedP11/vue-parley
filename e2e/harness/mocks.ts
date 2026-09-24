// Deterministic in-memory backends for the e2e harness. Everything a test needs to steer or
// inspect lives on `window.__harness`, so specs never reach into component internals.
import type {
  CallHandlers,
  CallMessageSchema,
  ChatHandlers,
  Contact,
  MediaHandlers,
  Message,
  MessagesHandlers,
  ProfileHandlers,
} from "~/types";

export const ME = new URLSearchParams(location.search).get("user") ?? "me";
export const MY_NAME =
  new URLSearchParams(location.search).get("name") ?? "Test User";

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000);

function contact(
  id: string,
  name: string,
  lastName: string,
  extra: Partial<Contact> = {},
): Contact {
  return {
    id,
    name,
    lastName,
    isOnline: false,
    lastSeen: minutesAgo(90),
    imageUrl: "",
    isActive: true,
    birthDate: new Date("1995-01-01"),
    serviceType: "video-call",
    userType: ["user"],
    ...extra,
  };
}

function msg(
  conversationId: string,
  n: number,
  senderId: string,
  text: string,
  minutes: number,
): Message {
  return {
    id: `${conversationId}-m${n}`,
    conversationId,
    date: minutesAgo(minutes),
    type: "text",
    text,
    isEdited: false,
    senderId,
    isSent: true,
    isRead: true,
  };
}

const contacts: Contact[] = [
  contact("c1", "Sara", "Ahmadi", { isOnline: true }),
  contact("c2", "Nima", "Karimi", { serviceType: "chat" }),
  contact("c3", "Leila", "Moradi", { isActive: false }),
];

const messageDb = new Map<string, Message[]>([
  [
    "c1",
    [
      msg("c1", 1, "c1", "Hello from Sara", 30),
      msg("c1", 2, ME, "Hi Sara, how are you?", 20),
      msg("c1", 3, "c1", "Ready for the video call?", 10),
    ],
  ],
  ["c2", [msg("c2", 1, "c2", "Nima says hi", 60)]],
  ["c3", [msg("c3", 1, "c3", "This conversation is over", 600)]],
]);

for (const c of contacts) {
  const list = messageDb.get(c.id)!;
  c.lastMessage = list[list.length - 1];
}

/** Knobs and a call log for the specs. */
export const harness = {
  failNextSend: false,
  failNextDelete: false,
  failNextEdit: false,
  calls: [] as { fn: string; args: unknown[] }[],
  db: messageDb,
};

/**
 * JSON round-trip, as a network hop would do. Drops the view-only links the UI adds to messages
 * (neighbours, contact), which are circular and never meant for the server.
 */
const toJson = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (key, val) =>
      ["prevMessage", "nextMessage", "contact"].includes(key) ? undefined : val,
    ),
  );

const log = (fn: string, ...args: unknown[]) =>
  harness.calls.push({ fn, args: toJson(args) });

// Handlers hand out copies, like JSON from a real server, so the stores never share objects
// with this in-memory "database".
const clone = <T>(v: T): T => structuredClone(v);

const delay = (ms = 50) => new Promise((r) => setTimeout(r, ms));

export function createChatHandlers(): ChatHandlers {
  return {
    async fetchConversations(params) {
      log("fetchConversations", params);
      await delay();
      const q = (params.search ?? "").trim().toLowerCase();
      const filtered = contacts.filter((c) => {
        if (q && !`${c.name} ${c.lastName}`.toLowerCase().includes(q))
          return false;
        if (params.state === "online") return c.isOnline;
        if (params.state === "active") return c.isActive;
        if (params.state === "ended") return !c.isActive;
        return true;
      });
      const start = (params.page - 1) * params.pageSize;
      return {
        data: clone(filtered.slice(start, start + params.pageSize)),
        hasNextPage: start + params.pageSize < filtered.length,
      };
    },
    async deleteConversation(id) {
      log("deleteConversation", id);
      await delay();
      const i = contacts.findIndex((c) => c.id === id);
      if (i !== -1) contacts.splice(i, 1);
    },
    async endConversation(id) {
      log("endConversation", id);
      await delay();
      const c = contacts.find((c) => c.id === id);
      if (c) c.isActive = false;
    },
  };
}

let serverId = 0;

export function createMessagesHandlers(): MessagesHandlers {
  return {
    async sendMessage(message, opts) {
      log("sendMessage", { ...message, date: undefined });
      if (opts?.onProgress) {
        for (const progress of [25, 50, 100]) {
          await delay(30);
          opts.onProgress({ uploaded: progress, total: 100, progress });
        }
      } else {
        await delay();
      }
      if (harness.failNextSend) {
        harness.failNextSend = false;
        throw new Error("send failed (harness)");
      }
      const saved: Message = {
        ...toJson(message),
        date: new Date(message.date),
        id: `srv-${++serverId}`,
        isSent: true,
      };
      messageDb.get(message.conversationId)?.push(saved);
      return clone(saved);
    },
    async editMessage(id, text) {
      log("editMessage", id, text);
      await delay();
      if (harness.failNextEdit) {
        harness.failNextEdit = false;
        throw new Error("edit failed (harness)");
      }
      for (const list of messageDb.values()) {
        const m = list.find((m) => m.id === id);
        if (m) {
          m.text = text;
          m.isEdited = true;
          return clone(m);
        }
      }
      throw new Error(`no message ${id}`);
    },
    async deleteMessages(ids) {
      log("deleteMessages", ids);
      await delay();
      if (harness.failNextDelete) {
        harness.failNextDelete = false;
        throw new Error("delete failed (harness)");
      }
      for (const [key, list] of messageDb) {
        messageDb.set(
          key,
          list.filter((m) => !ids.includes(m.id)),
        );
      }
    },
    async fetchMessages({ conversationId, page, pageSize }) {
      log("fetchMessages", { conversationId, page, pageSize });
      await delay();
      const list = messageDb.get(conversationId) ?? [];
      // Newest page first, oldest-to-newest within the page.
      const end = list.length - (page - 1) * pageSize;
      return clone(list.slice(Math.max(0, end - pageSize), Math.max(0, end)));
    },
    async markRead(conversationId) {
      log("markRead", conversationId);
    },
  };
}

export function createMediaHandlers(): MediaHandlers {
  return {
    async download(url, opts) {
      log("download", url);
      opts?.onProgress?.(100);
      return new Blob(["harness file"], { type: "text/plain" });
    },
    async getFileSize() {
      return 12;
    },
  };
}

export function createProfileHandlers(): ProfileHandlers {
  return {
    async fetchMedia() {
      return { data: [], hasNextPage: false };
    },
    async fetchFiles() {
      return { data: [], hasNextPage: false };
    },
  };
}

/**
 * Call signalling over BroadcastChannel, so two tabs of the same browser context can call each
 * other exactly as two clients behind a real pub/sub would. Every published payload is also
 * recorded for assertions.
 */
export function createCallHandlers(): CallHandlers & {
  published: CallMessageSchema[];
} {
  const channel = new BroadcastChannel("vue-chat-e2e-call");
  const listeners = new Map<number, (m: CallMessageSchema) => Promise<void>>();
  let nextId = 0;
  const published: CallMessageSchema[] = [];

  channel.onmessage = (e) => {
    const message = JSON.parse(e.data) as CallMessageSchema;
    listeners.forEach((cb) => void cb(message));
  };

  return {
    published,
    // No TURN server in tests: main.ts strips ICE servers and allows host candidates.
    credential: { ttl: 3600, user: "e2e", pass: "e2e", urls: ["turn:127.0.0.1:3478"] },
    async handleGenerateCred() {},
    async publisher(json) {
      published.push(JSON.parse(json));
      channel.postMessage(json);
    },
    async subscriber(cb) {
      const id = ++nextId;
      listeners.set(id, cb);
      return id;
    },
    async unSubscriber(id) {
      listeners.delete(id);
    },
  };
}
