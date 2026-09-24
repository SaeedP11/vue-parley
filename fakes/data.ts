// Seed data for the fake backend: a small fixed set the e2e specs assert against, and a larger
// generated one for the demo. Both are deterministic.
import type { Contact, Message } from "../app/types";

export interface FakeData {
  contacts: Contact[];
  messages: Map<string, Message[]>;
}

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000);

function contact(
  id: string,
  name: string,
  lastName: string,
  extra: Partial<Contact> = {},
): Contact {
  return {
    id,
    name,
    lastName,
    isOnline: false,
    lastSeen: minutesAgo(90),
    imageUrl: "",
    isActive: true,
    birthDate: new Date("1995-01-01"),
    serviceType: "video-call",
    userType: ["user"],
    ...extra,
  };
}

function text(
  conversationId: string,
  n: number,
  senderId: string,
  body: string,
  minutes: number,
): Message {
  return {
    id: `${conversationId}-m${n}`,
    conversationId,
    date: minutesAgo(minutes),
    type: "text",
    text: body,
    isEdited: false,
    senderId,
    isSent: true,
    isRead: true,
  };
}

function withLastMessages(data: FakeData): FakeData {
  for (const c of data.contacts) {
    const list = data.messages.get(c.id) ?? [];
    c.lastMessage = list[list.length - 1];
  }
  return data;
}

/**
 * Three conversations the e2e specs rely on: c1 active, online, with calls; c2 chat-only;
 * c3 ended.
 */
export function e2eData(userId: string): FakeData {
  return withLastMessages({
    contacts: [
      contact("c1", "Sara", "Ahmadi", { isOnline: true }),
      contact("c2", "Nima", "Karimi", { serviceType: "chat" }),
      contact("c3", "Leila", "Moradi", { isActive: false }),
    ],
    messages: new Map([
      [
        "c1",
        [
          text("c1", 1, "c1", "Hello from Sara", 30),
          text("c1", 2, userId, "Hi Sara, how are you?", 20),
          text("c1", 3, "c1", "Ready for the video call?", 10),
        ],
      ],
      ["c2", [text("c2", 1, "c2", "Nima says hi", 60)]],
      ["c3", [text("c3", 1, "c3", "This conversation is over", 600)]],
    ]),
  });
}

/** Park–Miller PRNG, so the demo looks the same on every load. */
function seeded(seed: number) {
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
  };
}

const FIRST_NAMES = ["علی", "محمد", "حسین", "رضا", "امیر", "سعید", "مهدی", "فاطمه", "زهرا", "مریم", "سارا", "نازنین", "لیلا", "مهسا", "پویا", "آرش", "نیما", "الهام", "پریسا", "مینا"] as const;
const LAST_NAMES = ["محمدی", "حسینی", "رضایی", "احمدی", "کریمی", "موسوی", "هاشمی", "جعفری", "صادقی", "نوری", "عباسی", "امیری", "فرهادی", "قاسمی", "طاهری", "مرادی"] as const;
const TEXTS = [
  "سلام، وقت بخیر",
  "ممنون بابت پیگیری",
  "بله، مشکلی نیست",
  "فایل رو فرستادم، چک کنید",
  "جلسه فردا سر ساعت ۱۰ برگزار میشه",
  "آیا امکان تغییر زمان وجود داره؟",
  "پروژه آماده است و میتونید بررسی کنید",
  "با تشکر از همکاری خوبتون",
  "من منتظر پاسخ شما هستم",
  "مورد تایید شد",
  "خسته نباشید",
  "فردا تماس میگیرم",
] as const;
const FILES = ["report.pdf", "invoice.xlsx", "contract.docx", "data.csv"] as const;

/** A realistic-looking Persian dataset for the demo: `count` conversations with history. */
export function demoData(userId: string, count = 40): FakeData {
  const rng = seeded(42);
  const contacts: Contact[] = [];
  const messages = new Map<string, Message[]>();

  for (let i = 1; i <= count; i++) {
    const id = `contact-${i}`;
    const isOnline = rng.next() < 0.4;
    contacts.push(
      contact(id, rng.pick(FIRST_NAMES), rng.pick(LAST_NAMES), {
        isOnline,
        lastSeen: minutesAgo(isOnline ? rng.int(1, 30) : rng.int(60, 10_080)),
        imageUrl: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
        isActive: rng.next() < 0.8,
        serviceType: rng.pick(["chat", "video-call", "voice-call"] as const),
        unreadCount: rng.next() < 0.3 ? rng.int(1, 12) : 0,
      }),
    );

    const history: Message[] = [];
    let minutes = rng.int(60, 4_000);
    const length = rng.int(5, 60);
    for (let n = 1; n <= length; n++) {
      minutes -= rng.int(1, 60);
      const senderId = rng.next() < 0.5 ? userId : id;
      const base = text(id, n, senderId, rng.pick(TEXTS), Math.max(minutes, 1));
      const roll = rng.next();
      if (roll < 0.1) {
        history.push({
          ...base,
          type: "image",
          text: "",
          imageUrl: [`https://picsum.photos/seed/${id}-${n}/400/300`],
        });
      } else if (roll < 0.18) {
        const fileName = rng.pick(FILES);
        history.push({
          ...base,
          type: "file",
          text: "",
          fileName,
          fileUrl: `https://example.com/files/${fileName}`,
        });
      } else {
        history.push(base);
      }
    }
    messages.set(id, history);
  }

  return withLastMessages({ contacts, messages });
}
