// `vue-parley/fakes`: an in-memory backend for demos, playgrounds and tests. Not for
// production: nothing is persisted, and calls only reach other tabs of the same browser.
export { createFakeBackend } from "./backend";
export type { FakeBackend, FakeBackendOptions, FakeBackendState } from "./backend";
export { createBroadcastCallHandlers } from "./call";
export type { FakeCallHandlers } from "./call";
export { demoData, e2eData } from "./data";
export type { FakeData } from "./data";
