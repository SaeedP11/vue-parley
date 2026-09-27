// This tab's fake backend and call bus, shared by main.ts (setup) and App.vue (test hooks).
import type { Message } from "~/types";
import { createFakeBackend } from "../../fakes/backend";
import { createBroadcastCallHandlers } from "../../fakes/call";
import { e2eData } from "../../fakes/data";

const params = new URLSearchParams(location.search);
export const ME = params.get("user") ?? "me";
export const MY_NAME = params.get("name") ?? "Test User";

const data = e2eData(ME);

// `history=<n>` gives c1 n older messages before its seeded three, so its first page is taller
// than the viewport.
const history = Number(params.get("history") ?? 0);
if (history > 0) {
  const seeded = data.messages.get("c1") ?? [];
  const oldest = new Date(seeded[0]?.date ?? Date.now()).getTime();
  const older: Message[] = Array.from({ length: history }, (_, i) => ({
    id: `c1-h${i}`,
    conversationId: "c1",
    date: new Date(oldest - (history - i) * 60_000),
    type: "text",
    text: `Earlier message ${i + 1}`,
    isEdited: false,
    senderId: i % 2 ? ME : "c1",
    isSent: true,
    isRead: true,
  }));
  data.messages.set("c1", [...older, ...seeded]);
}

export const backend = createFakeBackend(data);
export const call = createBroadcastCallHandlers("vue-chat-e2e-call");

// `messageDelay=<ms>` holds every message page back, so a conversation opened up front is on
// screen before its messages arrive.
const messageDelay = Number(params.get("messageDelay") ?? 0);
if (messageDelay > 0) {
  const fetchMessages = backend.messages.fetchMessages;
  backend.messages.fetchMessages = async (request) => {
    await new Promise((r) => setTimeout(r, messageDelay));
    return fetchMessages(request);
  };
}
