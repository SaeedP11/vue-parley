import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

export interface HarnessWindow {
  __harness: {
    state: {
      failNextSend: boolean;
      failNextDelete: boolean;
      failNextEdit: boolean;
      calls: { fn: string; args: unknown[] }[];
    };
    published: { type: string; payload: Record<string, unknown> }[];
    callStore: { isActive: boolean; isMinimized: boolean; channelId: string | null };
    setRenderCall: (value: boolean) => void;
    mediaStore: { download: (url: string) => Promise<Blob> };
    session: () => HarnessSession | null;
    failPeer: (remoteId: string) => void;
    blockPeer: (remoteId: string) => void;
    unblockPeer: (remoteId: string) => void;
    senderParams: () => Record<string, HarnessSender[]>;
  };
}

export interface HarnessParticipant {
  id: string;
  userId: string;
  name: string;
  isSelf: boolean;
  joinedAt?: number;
  media?: { audio: boolean; video: boolean };
  status: "connecting" | "connected" | "recovering" | "unreachable";
  hasCamera: boolean;
  hasScreen: boolean;
}

export interface HarnessSession {
  selfId: string;
  phase: string;
  participants: HarnessParticipant[];
  /** Remote id → a number per connection object: the same number means the same connection. */
  peerIds: Record<string, number>;
  peerStatus: Record<string, string>;
}

export interface HarnessSender {
  kind: string;
  screen: boolean;
  encodings: (RTCRtpEncodingParameters & { priority?: string; networkPriority?: string })[];
}

export async function openHarness(
  page: Page,
  { user = "me", name = "Test User" } = {},
) {
  await page.goto(`/?user=${user}&name=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("chat-contact").first()).toBeVisible();
}

export function contactItem(page: Page, id: string) {
  return page.locator(`[data-testid="chat-contact"][data-contact-id="${id}"]`);
}

export async function openConversation(page: Page, id: string) {
  await contactItem(page, id).click();
  await expect(page.getByTestId("chat-bubble").first()).toBeVisible();
}

export function bubble(page: Page, text: string | RegExp) {
  return page.getByTestId("chat-bubble").filter({ hasText: text });
}

export async function typeAndSend(page: Page, text: string) {
  const input = page.getByTestId("chat-input");
  await input.click();
  await input.pressSequentially(text);
  await input.press("Enter");
}

export async function openBubbleMenu(page: Page, text: string) {
  await bubble(page, text).last().click({ button: "right" });
}

/** Names of the handler calls the harness has seen, e.g. ["fetchConversations", ...]. */
export function handlerCalls(page: Page, fn: string) {
  return page.evaluate(
    (fn) =>
      (window as unknown as HarnessWindow).__harness.state.calls.filter(
        (c) => c.fn === fn,
      ),
    fn,
  );
}

export function setHarnessFlag(
  page: Page,
  flag: "failNextSend" | "failNextDelete" | "failNextEdit",
) {
  return page.evaluate(
    (flag) => ((window as unknown as HarnessWindow).__harness.state[flag] = true),
    flag,
  );
}

// --- Calls ---

/** Resolves once the <video> is actually rendering frames from a live stream. */
export async function expectPlayingVideo(video: Locator, timeout = 20_000) {
  await expect
    .poll(
      () =>
        video.evaluate((el: HTMLVideoElement) => {
          const stream = el.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()[0];
          return (
            !!track &&
            track.readyState === "live" &&
            el.videoWidth > 0 &&
            el.readyState >= 2
          );
        }),
      { timeout },
    )
    .toBe(true);
}

/** One harness page per user, all in `context`, so they share the call bus. */
export async function openCallers(
  context: BrowserContext,
  users: { user: string; name: string }[],
  query = "",
): Promise<Page[]> {
  const pages: Page[] = [];
  for (const { user, name } of users) {
    const page = await context.newPage();
    await page.goto(`/?user=${user}&name=${encodeURIComponent(name)}${query}`);
    await expect(page.getByTestId("chat-contact").first()).toBeVisible();
    pages.push(page);
  }
  return pages;
}

/** The remote camera tiles on a page. */
export function remoteTiles(page: Page) {
  return page.locator('[data-testid="call-remote-video"]');
}

/** Waits until exactly `n` remote camera tiles show, each playing live video. */
export async function expectRemoteCount(page: Page, n: number, timeout = 30_000) {
  const tiles = remoteTiles(page);
  await expect(tiles).toHaveCount(n, { timeout });
  for (let i = 0; i < n; i++) await expectPlayingVideo(tiles.nth(i).locator("video"), timeout);
}

/** The page's running call as plain data, or null when it is in none. */
export function callSession(page: Page) {
  return page.evaluate(() => (window as unknown as HarnessWindow).__harness.session());
}
