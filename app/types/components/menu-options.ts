import type { Component, InjectionKey } from "vue";
import type { ExtendedMessage } from "~/types";

export interface MenuOption {
  key: string;
  /** A Phosphor icon name `BIcon` knows ("PhXSquare"), or any component, e.g. the host's own icon. */
  icon?: string | Component;
  label: string;
  /** "primary" accents the item, "error" marks it destructive. */
  color?: string;
  disabled?: boolean;
  /** Runs on select. Without it the header emits `select` with the key. */
  command?: () => void;
}

/**
 * Host actions for one message, listed in its menu between the quick actions and delete. Asked
 * afresh each time the menu renders, so the items can follow the message's state (pin or unpin).
 */
export type MessageOptions = (message: ExtendedMessage) => MenuOption[];

/** How `<ChatPage>` hands `messageOptions` down to every bubble's menu. */
export const messageOptionsKey: InjectionKey<() => MessageOptions | undefined> = Symbol("messageOptions");
