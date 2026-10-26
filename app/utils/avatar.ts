/**
 * Initials and colour for an avatar without a picture: the first letter of the first and the last
 * name on one of the `--color-chat-avatar-*` tones (assets/css/theme.css), picked from a hash of the
 * name so a person keeps one colour everywhere. The same rules as the phc-frontend app's
 * `utils/avatar.ts`, so a person has the same initials and colour inside the chat and out of it:
 * keep the two in step.
 */

/** How many tones `--color-chat-avatar-1` … `-N` define. Keep in step with theme.css. */
export const AVATAR_TONE_COUNT = 10;

// Honorifics written in front of a name: "دکتر علی رضایی" is «ع‌ر», not «د‌ر».
const TITLES = new Set([
  "دکتر",
  "دكتر",
  "پزشک",
  "کارشناس",
  "آقای",
  "خانم",
  "dr",
  "dr.",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
]);

const FIRST_LETTER_RE = /[\p{L}\p{N}]/u;
const ARABIC_SCRIPT_RE = /\p{Script=Arabic}/u;
// Two Persian letters side by side join into a word («عر»); a zero-width non-joiner keeps them apart.
const ZWNJ = "\u200C";

const words = (value?: string | null) =>
  (value ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !TITLES.has(word.toLowerCase()));

const firstLetter = (word?: string) => word?.match(FIRST_LETTER_RE)?.[0]?.toLocaleUpperCase() ?? "";

/**
 * "Ali Rezaei" → "AR", «سارا محمدی» → «س‌م», "Madonna" → "M". With `lastName`, `first` is the first
 * name; without it, `first` is a full name and its first and last words are used. Empty when there
 * is no letter to show.
 */
export const nameInitials = (first?: string | null, lastName?: string | null): string => {
  const firstWords = words(first);
  const lastWords = words(lastName);

  const head = firstLetter(firstWords[0] ?? lastWords[0]);
  const tail = lastWords.length
    ? firstWords.length
      ? firstLetter(lastWords[0])
      : firstLetter(lastWords[1])
    : firstLetter(firstWords.length > 1 ? firstWords.at(-1) : undefined);

  if (!head || !tail) return head || tail;
  return ARABIC_SCRIPT_RE.test(head) && ARABIC_SCRIPT_RE.test(tail) ? `${head}${ZWNJ}${tail}` : `${head}${tail}`;
};

/** The name as a colour seed: its words without honorifics, so a full name and its parts match. */
export const nameSeed = (first?: string | null, lastName?: string | null): string =>
  [...words(first), ...words(lastName)].join(" ");

/** 1 … AVATAR_TONE_COUNT, stable for a seed (FNV-1a, so close seeds still spread over the palette). */
export const avatarTone = (seed?: string | null): number => {
  const key = (seed ?? "").trim().toLowerCase();
  if (!key) return 1;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % AVATAR_TONE_COUNT) + 1;
};

/**
 * Inline colours for an avatar showing initials. `surface` "dark" takes the dark tones whatever the
 * page theme, for the call screen, which is always dark.
 */
export const avatarToneStyle = (
  first?: string | null,
  lastName?: string | null,
  surface: "theme" | "dark" = "theme",
): Record<string, string> => {
  const tone = nameInitials(first, lastName) ? String(avatarTone(nameSeed(first, lastName))) : "none";
  const prefix = surface === "dark" ? "--chat-avatar-dark" : "--color-chat-avatar";
  return { backgroundColor: `var(${prefix}-${tone})`, color: `var(${prefix}-${tone}-fg)` };
};
