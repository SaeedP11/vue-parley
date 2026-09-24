import { expect, type Page } from "@playwright/test";

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
  };
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
