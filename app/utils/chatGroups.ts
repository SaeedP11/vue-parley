import type { Contact } from "~/types";

export type ChatGroupKey = "today" | "yesterday" | "lastWeek" | "lastMonth";

export type ChatListRow =
  | { kind: "header"; id: string; group: ChatGroupKey | null; label: string }
  | { kind: "contact"; id: string; contact: Contact };

const DAY = 86_400_000;

export const lastActivityOf = (contact: Contact) => {
  const date = contact.lastMessage?.date ?? contact.lastActivity;
  return date ? new Date(date).getTime() : 0;
};

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Year and month in the locale's calendar (Persian for `fa`). */
const calendarParts = (date: Date, lang: string) => {
  const calendar = lang === "fa" ? "persian" : "gregory";
  const parts = new Intl.DateTimeFormat(`en-US-u-ca-${calendar}`, {
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value.replace(/\D/g, ""));
  return { year: pick("year"), month: pick("month") };
};

/**
 * Splits contacts into ChatGPT-style sections by last activity, newest first: today, yesterday,
 * the previous 7 and 30 days, then one section per calendar month. Empty sections are skipped.
 * Within a section active conversations come before ended ones, as the store's own sort has them.
 */
export const groupContacts = (
  contacts: readonly Contact[],
  lang: string,
  groupLabel: (key: ChatGroupKey) => string,
  now = new Date(),
): ChatListRow[] => {
  const today = startOfDay(now);
  const nowYear = calendarParts(now, lang).year;
  const calendarLang = lang === "fa" ? "fa-IR-u-ca-persian" : lang;
  const monthOnly = new Intl.DateTimeFormat(calendarLang, { month: "long" });
  const monthYear = new Intl.DateTimeFormat(calendarLang, { month: "long", year: "numeric" });

  const sections: { header: ChatListRow; contacts: Contact[] }[] = [];
  let currentId = "";
  const sorted = [...contacts].sort((a, b) => lastActivityOf(b) - lastActivityOf(a));

  for (const contact of sorted) {
    const time = lastActivityOf(contact);
    const days = Math.round((today - startOfDay(new Date(time))) / DAY);
    let id: string;
    let group: ChatGroupKey | null = null;
    let label: string;

    if (days <= 0) group = "today";
    else if (days === 1) group = "yesterday";
    else if (days <= 7) group = "lastWeek";
    else if (days <= 30) group = "lastMonth";

    if (group) {
      id = group;
      label = groupLabel(group);
    } else {
      const date = new Date(time);
      const { year, month } = calendarParts(date, lang);
      id = `${year}-${month}`;
      label = (year === nowYear ? monthOnly : monthYear).format(date);
    }

    if (id !== currentId) {
      sections.push({ header: { kind: "header", id: `header-${id}`, group, label }, contacts: [] });
      currentId = id;
    }
    sections.at(-1)!.contacts.push(contact);
  }

  // Stable, so each half keeps its newest-first order.
  const isEnded = (contact: Contact) => Number(contact.isActive === false);
  return sections.flatMap(({ header, contacts }) => [
    header,
    ...contacts
      .sort((a, b) => isEnded(a) - isEnded(b))
      .map((contact): ChatListRow => ({ kind: "contact", id: contact.id, contact })),
  ]);
};
