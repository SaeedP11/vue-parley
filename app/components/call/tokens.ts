// The call screen is dark whatever the host's colour scheme, so its controls use fixed tokens
// instead of the theme's: translucent white at rest, white when a feature is on (Meet's "lit"),
// red when the microphone or camera is off. Shared by Call.vue and the tiles and drawer in it.

const translucent = {
  background: "rgb(255 255 255 / 0.12)",
  hoverBackground: "rgb(255 255 255 / 0.2)",
  activeBackground: "rgb(255 255 255 / 0.28)",
  borderColor: "transparent",
  hoverBorderColor: "transparent",
  activeBorderColor: "transparent",
  color: "#ffffff",
  hoverColor: "#ffffff",
  activeColor: "#ffffff",
};
const lit = {
  background: "#ffffff",
  hoverBackground: "rgb(255 255 255 / 0.9)",
  activeBackground: "rgb(255 255 255 / 0.8)",
  borderColor: "#ffffff",
  hoverBorderColor: "#ffffff",
  activeBorderColor: "#ffffff",
  color: "#171717",
  hoverColor: "#171717",
  activeColor: "#171717",
};
// Tailwind's red-500 to red-700.
const off = {
  background: "#ef4444",
  hoverBackground: "#dc2626",
  activeBackground: "#b91c1c",
  borderColor: "transparent",
  hoverBorderColor: "transparent",
  activeBorderColor: "transparent",
  color: "#ffffff",
  hoverColor: "#ffffff",
  activeColor: "#ffffff",
};
const callScheme = { root: { secondary: translucent, contrast: lit, danger: off } };
export const callButtonDt = { colorScheme: { light: callScheme, dark: callScheme } };

// Its menus are dark too, Tailwind's neutral-800 under white text, in either host scheme.
export const callMenuDt = {
  root: { background: "#262626", borderColor: "rgb(255 255 255 / 0.1)", color: "#f5f5f5" },
  item: {
    focusBackground: "rgb(255 255 255 / 0.1)",
    color: "#f5f5f5",
    focusColor: "#ffffff",
    icon: { color: "#a3a3a3", focusColor: "#ffffff" },
  },
  submenuLabel: { background: "transparent", color: "#a3a3a3" },
};

// The participant drawer, in the same dark palette as the menus.
export const callDrawerDt = {
  root: { background: "#262626", borderColor: "rgb(255 255 255 / 0.1)", color: "#f5f5f5" },
  header: { padding: "1rem 1rem 0.5rem" },
  content: { padding: "0 0.5rem 1rem" },
};

// Tile actions sit on the video: small round buttons, shown on hover or focus where there is a
// pointer that hovers, always on touch screens, where they grow to a 44px target.
export const tileButton = {
  dt: callButtonDt,
  text: false,
  size: "small",
  iconClass: "size-4.5",
  class: "size-9! [@media(hover:none)]:size-11!",
} as const;
export const tileActions =
  "absolute end-2 bottom-2 z-20 flex items-center gap-x-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100";
export const nameChip =
  "min-w-0 truncate rounded-md bg-black/60 px-2 py-0.5 text-label-sm text-white backdrop-blur-sm select-none";
/** A focus ring that shows on the dark stage. */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900";

// Tooltips are appended to <body>, outside the chat, so they take its font and reset with them.
export const tip = (value: string) => ({ value, class: "vue-chat font-chat-family" });
