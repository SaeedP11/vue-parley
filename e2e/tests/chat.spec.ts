import { expect, test } from "./fixtures";
import {
  bubble,
  contactItem,
  handlerCalls,
  openBubbleMenu,
  openConversation,
  openHarness,
  setHarnessFlag,
  typeAndSend,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test.describe("conversation list", () => {
  test("loads conversations sorted by latest message", async ({ page }) => {
    const names = await page.getByTestId("chat-contact").allInnerTexts();
    expect(names).toHaveLength(3);
    // c1's last message is newest, c3's oldest.
    expect(names[0]).toContain("Sara Ahmadi");
    expect(names[2]).toContain("Leila Moradi");
    expect(await handlerCalls(page, "fetchConversations")).not.toHaveLength(0);
  });

  test("shows a formatted time, not a raw date", async ({ page }) => {
    // Every seeded last message is from today, so each row shows a time like "10:41".
    for (const row of await page.getByTestId("chat-contact").all()) {
      await expect(row).not.toContainText("GMT");
      await expect(row).toContainText(/\d{1,2}:\d{2}/);
    }
  });

  test("keeps its reset inside the chat", async ({ page }) => {
    const layout = await page.evaluate(() => {
      const host = document.createElement("h1");
      host.textContent = "host heading";
      document.body.append(host);
      const style = getComputedStyle(host);
      const panel = document.querySelector<HTMLElement>(".vue-chat")!;
      return {
        hostMargin: parseFloat(style.marginTop),
        hostFontSize: parseFloat(style.fontSize),
        chatBoxSizing: getComputedStyle(panel).boxSizing,
      };
    });
    // Browser defaults survive outside the chat...
    expect(layout.hostMargin).toBeGreaterThan(0);
    expect(layout.hostFontSize).toBeGreaterThan(16);
    // ...while the chat itself gets the reset it relies on.
    expect(layout.chatBoxSizing).toBe("border-box");
  });

  test("shows the empty placeholder until a conversation is picked", async ({
    page,
  }) => {
    await expect(page.getByText("No conversation selected yet")).toBeVisible();
    await openConversation(page, "c1");
    await expect(page.getByText("No conversation selected yet")).toHaveCount(0);
  });

  test("filters by state", async ({ page }) => {
    await page.getByText("Ended", { exact: true }).first().click();
    await expect(page.getByTestId("chat-contact")).toHaveCount(1);
    await expect(contactItem(page, "c3")).toBeVisible();

    await page.reload();
    await page.getByText("Active", { exact: true }).first().click();
    await expect(page.getByTestId("chat-contact")).toHaveCount(2);
    await expect(contactItem(page, "c3")).toHaveCount(0);
  });

  test("searches by name", async ({ page }) => {
    await page.getByTestId("chat-search-toggle").click();
    await page.getByTestId("chat-search").fill("nima");
    await expect(page.getByTestId("chat-contact")).toHaveCount(1);
    await expect(contactItem(page, "c2")).toBeVisible();

    await page.getByTestId("chat-search").fill("");
    await expect(page.getByTestId("chat-contact")).toHaveCount(3);
  });
});

test.describe("messaging", () => {
  test.beforeEach(async ({ page }) => {
    await openConversation(page, "c1");
  });

  test("renders the conversation history and marks it read", async ({
    page,
  }) => {
    await expect(bubble(page, "Hello from Sara")).toBeVisible();
    await expect(bubble(page, "Hi Sara, how are you?")).toBeVisible();
    await expect(bubble(page, "Ready for the video call?")).toBeVisible();
    expect(await handlerCalls(page, "markRead")).toContainEqual({
      fn: "markRead",
      args: ["c1"],
    });
  });

  test("sends a text message", async ({ page }) => {
    await typeAndSend(page, "A brand new message");
    await expect(bubble(page, "A brand new message")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toHaveText("");

    await expect
      .poll(async () => (await handlerCalls(page, "sendMessage")).length)
      .toBe(1);
    const [call] = await handlerCalls(page, "sendMessage");
    expect(call.args[0]).toMatchObject({
      conversationId: "c1",
      senderId: "me",
      type: "text",
      text: "A brand new message",
    });
    // The contact list preview follows the newest message.
    await expect(contactItem(page, "c1")).toContainText("A brand new message");
  });

  test("marks a failed send and retries it", async ({ page }) => {
    await setHarnessFlag(page, "failNextSend");
    await typeAndSend(page, "This one fails first");
    const failed = bubble(page, "This one fails first");
    await expect(failed).toBeVisible();
    await expect
      .poll(async () => (await handlerCalls(page, "sendMessage")).length)
      .toBe(1);

    // BubbleStatus offers a retry on failed messages.
    await failed.locator("svg").last().click();
    await expect
      .poll(async () => (await handlerCalls(page, "sendMessage")).length)
      .toBe(2);
    await expect(failed).toBeVisible();
  });

  test("replies to a message", async ({ page }) => {
    await openBubbleMenu(page, "Ready for the video call?");
    await page.getByText("Reply", { exact: true }).click();
    await typeAndSend(page, "Yes, calling now");

    await expect
      .poll(async () => (await handlerCalls(page, "sendMessage")).length)
      .toBe(1);
    const [call] = await handlerCalls(page, "sendMessage");
    expect(call.args[0]).toMatchObject({
      text: "Yes, calling now",
      repliedTo: { id: "c1-m3" },
    });
    await expect(bubble(page, "Yes, calling now")).toContainText(
      "Ready for the video call?",
    );
  });

  test("edits an own message", async ({ page }) => {
    await openBubbleMenu(page, "Hi Sara, how are you?");
    await page.getByText("Edit message", { exact: true }).click();

    const input = page.getByTestId("chat-input");
    await expect(input).toHaveText("Hi Sara, how are you?");
    await input.press("ControlOrMeta+a");
    await input.pressSequentially("Edited greeting");
    await input.press("Enter");

    await expect(bubble(page, "Edited greeting")).toBeVisible();
    await expect
      .poll(() => handlerCalls(page, "editMessage"))
      .toEqual([{ fn: "editMessage", args: ["c1-m2", "Edited greeting"] }]);
  });

  test("rolls back a failed edit", async ({ page }) => {
    await setHarnessFlag(page, "failNextEdit");
    await openBubbleMenu(page, "Hi Sara, how are you?");
    await page.getByText("Edit message", { exact: true }).click();
    const input = page.getByTestId("chat-input");
    await input.press("ControlOrMeta+a");
    await input.pressSequentially("Will not stick");
    await input.press("Enter");

    await expect(bubble(page, "Hi Sara, how are you?")).toBeVisible();
    await expect(bubble(page, "Will not stick")).toHaveCount(0);
  });

  test("deletes a message after confirmation", async ({ page }) => {
    await openBubbleMenu(page, "Hi Sara, how are you?");
    await page.getByText("Delete message", { exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(bubble(page, "Hi Sara, how are you?")).toHaveCount(0);
    await expect
      .poll(() => handlerCalls(page, "deleteMessages"))
      .toEqual([{ fn: "deleteMessages", args: [["c1-m2"]] }]);
  });

  test("restores messages when delete fails", async ({ page }) => {
    await setHarnessFlag(page, "failNextDelete");
    await openBubbleMenu(page, "Hi Sara, how are you?");
    await page.getByText("Delete message", { exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect
      .poll(async () => (await handlerCalls(page, "deleteMessages")).length)
      .toBe(1);
    await expect(bubble(page, "Hi Sara, how are you?")).toBeVisible();
  });

  test("selects several messages", async ({ page }) => {
    await openBubbleMenu(page, "Hello from Sara");
    await page.getByText("Select", { exact: true }).click();
    const selected = () =>
      page.evaluate(
        () => (window as any).__harness.messagesStore.selectedArray.length,
      );
    // The menu action runs after its close animation.
    await expect.poll(selected).toBe(1);
    await expect(page.getByText("Delete message", { exact: true })).toBeHidden();
    await bubble(page, "Ready for the video call?")
      .getByText("Ready for the video call?")
      .click();

    await expect.poll(selected).toBe(2);
  });

  test("sends a file attachment with upload progress", async ({ page }) => {
    await page.getByTestId("chat-attach").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByText("File", { exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello from the e2e suite"),
    });
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect
      .poll(async () => (await handlerCalls(page, "sendMessage")).length)
      .toBe(1);
    const [call] = await handlerCalls(page, "sendMessage");
    expect(call.args[0]).toMatchObject({ type: "file", fileName: "notes.txt" });
    await expect(bubble(page, "notes.txt")).toBeVisible();
  });

  test("inserts an emoji from the picker, loaded on first use", async ({ page }) => {
    await expect(page.locator(".v3-emoji-picker")).toHaveCount(0);
    await page.getByTestId("chat-emoji").click();
    await page.getByRole("button", { name: "😀" }).first().click();
    await expect(page.getByTestId("chat-input")).toContainText("😀");
  });

  test("keeps a per-conversation draft", async ({ page }) => {
    const input = page.getByTestId("chat-input");
    await input.click();
    await input.pressSequentially("unsent draft");

    await openConversation(page, "c2");
    await expect(page.getByTestId("chat-input")).toHaveText("");

    await openConversation(page, "c1");
    await expect(page.getByTestId("chat-input")).toHaveText("unsent draft");
  });
});

test.describe("conversation lifecycle", () => {
  test("locks the input on ended conversations", async ({ page }) => {
    await openConversation(page, "c3");
    await expect(page.getByText("This conversation has ended")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toHaveCount(0);
  });

  test("ends an active conversation", async ({ page }) => {
    await openConversation(page, "c1");
    await page.getByTestId("chat-more-options").click();
    await page.getByText("End conversation", { exact: true }).click();
    await page.getByRole("button", { name: "End", exact: true }).click();

    await expect
      .poll(() => handlerCalls(page, "endConversation"))
      .toEqual([{ fn: "endConversation", args: ["c1"] }]);
    await expect(page.getByText("This conversation has ended")).toBeVisible();
    await expect(page.getByTestId("chat-input")).toHaveCount(0);
  });

  test("Escape closes an open menu, not the conversation", async ({ page }) => {
    await openConversation(page, "c1");
    await page.getByTestId("chat-more-options").click();
    await expect(page.getByText("End conversation", { exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("End conversation", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("chat-input")).toBeVisible();

    // With nothing open, Escape still closes the conversation.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("chat-input")).toHaveCount(0);
  });

  test("text-only conversations have no call button", async ({ page }) => {
    await openConversation(page, "c2");
    await expect(page.getByTestId("chat-start-call")).toHaveCount(0);
  });
});

test.describe("images", () => {
  test("the viewer mounts on first open", async ({ page }) => {
    await openConversation(page, "c2");
    // Not mounted up front: one idle full-screen overlay per image bubble adds up.
    await expect(page.getByTestId("image-viewer")).toHaveCount(0);

    await page.getByTestId("bubble-image").click();
    await expect(page.getByTestId("image-viewer")).toHaveAttribute("data-open", "true");

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="image-viewer"][data-open="true"]')).toHaveCount(0);
    // Escape was for the viewer, not the conversation behind it.
    await expect(page.getByTestId("chat-input")).toBeVisible();
  });
});

test.describe("media cache", () => {
  test("downloads a file once, then serves it from the cache", async ({ page }) => {
    const download = () =>
      page.evaluate(async () => {
        const blob = await (window as any).__harness.mediaStore.download(
          "https://example.com/cached.txt",
        );
        return blob.size;
      });

    const first = await download();
    const second = await download();
    expect(second).toBe(first);
    expect(await handlerCalls(page, "download")).toHaveLength(1);
  });
});

test.describe("deep links", () => {
  test("a conversation no list has fetched can be added and opened", async ({ page }) => {
    // What a host does for /chat/<id> when the id isn't on a loaded page of the list.
    await page.evaluate(() => {
      const store = (window as any).__harness.chatStore;
      store.addContact({
        id: "c9",
        name: "Deep",
        lastName: "Link",
        isOnline: false,
        imageUrl: "",
        isActive: true,
        birthDate: new Date("1990-01-01"),
        serviceType: "chat",
        userType: ["user"],
      });
      store.setSelectedChat("c9");
    });
    await expect(contactItem(page, "c9")).toContainText("Deep Link");
    await expect(page.getByTestId("chat-input")).toBeVisible();
  });
});
