import type { Component } from "vue";

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
