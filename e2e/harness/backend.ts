// This tab's fake backend and call bus, shared by main.ts (setup) and App.vue (test hooks).
import { createFakeBackend } from "../../fakes/backend";
import { createBroadcastCallHandlers } from "../../fakes/call";
import { e2eData } from "../../fakes/data";

const params = new URLSearchParams(location.search);
export const ME = params.get("user") ?? "me";
export const MY_NAME = params.get("name") ?? "Test User";

export const backend = createFakeBackend(e2eData(ME));
export const call = createBroadcastCallHandlers("vue-chat-e2e-call");
