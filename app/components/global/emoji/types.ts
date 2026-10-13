export type EmojiGroupKey =
  | "smileys-emotion"
  | "people-body"
  | "animals-nature"
  | "food-drink"
  | "travel-places"
  | "activities"
  | "objects"
  | "symbols"
  | "flags";

/** The glyph, its English name and its other search keywords (space-separated). */
export type EmojiEntry = [emoji: string, label: string, keywords: string];

export type EmojiGroups = Record<EmojiGroupKey, EmojiEntry[]>;

/** What BEmojiPicker's `select` event carries. */
export interface EmojiSelection {
  /** The emoji itself, ready to insert as text. */
  emoji: string;
  /** Its English name, e.g. "grinning face". */
  label: string;
}
