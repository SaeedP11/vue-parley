import { createCallHandlers } from "./mocks";

/** The one call-signalling bus of this tab, shared by main.ts and the test hooks in App.vue. */
export const call = createCallHandlers();
