import { inject, provide, type InjectionKey } from "vue";
import type { CallHandlers } from "../types";

export const CALL_HANDLERS: InjectionKey<CallHandlers | null> =
  Symbol("call_handlers");

/** Component-level alternative to `createChat({ call })`. */
export function provideCallHandlers(handlers: CallHandlers) {
  provide(CALL_HANDLERS, handlers);
}

export function useCallHandlers() {
  const helpers = inject(CALL_HANDLERS, null);

  if (!helpers) {
    throw new Error(
      "[vue-chat] No call handlers: pass `call` to createChat() or call provideCallHandlers() in an ancestor",
    );
  }

  return helpers;
}
