// In-memory implementations of every handler interface the chat needs, shared by the demo and
// the e2e harness. `state` lets tests make the next call fail and see which handlers ran.
import type {
  ChatHandlers,
  MediaHandlers,
  Message,
  MessagesHandlers,
  ProfileHandlers,
} from "../app/types";
import type { FakeData } from "./data";

export interface FakeBackendState {
  failNextSend: boolean;
  failNextDelete: boolean;
  failNextEdit: boolean;
  /** Every handler call, with its arguments as JSON. */
  calls: { fn: string; args: unknown[] }[];
}

export interface FakeBackend {
  chat: ChatHandlers;
  messages: MessagesHandlers;
  media: MediaHandlers;
  profile: ProfileHandlers;
  state: FakeBackendState;
}

export interface FakeBackendOptions {
  /** Simulated network latency in ms. */
  latency?: number;
}

/**
 * JSON round-trip, as a network hop would do. Drops the view-only links the UI adds to messages
 * (neighbours, contact), which are circular and never meant for a server.
 */
const toJson = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (key, val) =>
      ["prevMessage", "nextMessage", "contact"].includes(key) ? undefined : val,
    ),
  );

// Handlers hand out copies, like a real server, so stores never share objects with the "database".
const clone = <T>(value: T): T => structuredClone(value);

export function createFakeBackend(
  data: FakeData,
  { latency = 50 }: FakeBackendOptions = {},
): FakeBackend {
  const { contacts, messages: db } = data;
  const state: FakeBackendState = {
    failNextSend: false,
    failNextDelete: false,
    failNextEdit: false,
    calls: [],
  };
  const log = (fn: string, ...args: unknown[]) =>
    state.calls.push({ fn, args: toJson(args) });
  const delay = (ms = latency) => new Promise((r) => setTimeout(r, ms));
  /** Returns whether `flag` was armed, disarming it. */
  const consume = (flag: "failNextSend" | "failNextDelete" | "failNextEdit") => {
    const armed = state[flag];
    state[flag] = false;
    return armed;
  };
  let serverId = 0;

  const chat: ChatHandlers = {
    async fetchConversations(params) {
      log("fetchConversations", params);
      await delay();
      const q = (params.search ?? "").trim().toLowerCase();
      const filtered = contacts.filter((c) => {
        if (q && !`${c.name} ${c.lastName}`.toLowerCase().includes(q)) return false;
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

  const messages: MessagesHandlers = {
    async sendMessage(message, opts) {
      log("sendMessage", { ...message, date: undefined });
      if (opts?.onProgress) {
        for (const progress of [25, 50, 100]) {
          await delay(latency / 2);
          opts.onProgress({ uploaded: progress, total: 100, progress });
        }
      } else {
        await delay();
      }
      if (consume("failNextSend")) throw new Error("send failed (fake backend)");

      const saved: Message = {
        ...toJson(message),
        date: new Date(message.date),
        id: `srv-${++serverId}`,
        isSent: true,
      };
      db.get(message.conversationId)?.push(saved);
      const c = contacts.find((c) => c.id === message.conversationId);
      if (c) c.lastMessage = saved;
      return clone(saved);
    },
    async editMessage(id, text) {
      log("editMessage", id, text);
      await delay();
      if (consume("failNextEdit")) throw new Error("edit failed (fake backend)");
      for (const list of db.values()) {
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
      if (consume("failNextDelete")) throw new Error("delete failed (fake backend)");
      for (const [key, list] of db) {
        db.set(
          key,
          list.filter((m) => !ids.includes(m.id)),
        );
      }
    },
    async fetchMessages({ conversationId, page, pageSize }) {
      log("fetchMessages", { conversationId, page, pageSize });
      await delay();
      const list = db.get(conversationId) ?? [];
      // Newest page first, oldest-to-newest within the page.
      const end = list.length - (page - 1) * pageSize;
      return clone(list.slice(Math.max(0, end - pageSize), Math.max(0, end)));
    },
    async markRead(conversationId) {
      log("markRead", conversationId);
      const c = contacts.find((c) => c.id === conversationId);
      if (c) c.unreadCount = 0;
    },
  };

  const media: MediaHandlers = {
    async download(url, opts) {
      log("download", url);
      // Real URLs (the demo's pictures) are fetched; made-up ones get a placeholder file.
      let blob: Blob;
      try {
        const res = await fetch(url, { signal: opts?.signal });
        if (!res.ok) throw new Error(String(res.status));
        blob = await res.blob();
      } catch {
        blob = new Blob(["fake file"], { type: "text/plain" });
      }
      opts?.onProgress?.(100);
      return blob;
    },
    async getFileSize() {
      return 1024;
    },
  };

  const attachments = (conversationId: string, pick: (m: Message) => string[]) =>
    (db.get(conversationId) ?? []).flatMap(pick);

  const profile: ProfileHandlers = {
    async fetchMedia({ conversationId, page, pageSize }) {
      const all = attachments(conversationId, (m) => m.imageUrl ?? []);
      const start = (page - 1) * pageSize;
      return {
        data: all.slice(start, start + pageSize),
        hasNextPage: start + pageSize < all.length,
      };
    },
    async fetchFiles({ conversationId, page, pageSize }) {
      const all = attachments(conversationId, (m) => (m.fileUrl ? [m.fileUrl] : []));
      const start = (page - 1) * pageSize;
      return {
        data: all.slice(start, start + pageSize),
        hasNextPage: start + pageSize < all.length,
      };
    },
  };

  return { chat, messages, media, profile, state };
}
