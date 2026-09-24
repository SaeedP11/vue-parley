import type { CallHandlers } from "../types";
import { useCallStore } from "../stores/callStore";

/**
 * Gives the chat its call handlers from inside a component's setup. `createChat({ call })` does
 * the same app-wide; use this when the handlers only exist further down the tree.
 */
export function provideCallHandlers(handlers: CallHandlers) {
  useCallStore().setHandlers(handlers);
}
