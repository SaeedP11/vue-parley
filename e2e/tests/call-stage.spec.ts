import { mkdirSync } from "node:fs";
import { expect, test } from "./fixtures";
import { callSession, expectPlayingVideo, expectRemoteCount, openCallers, openConversation } from "./helpers";

// Three tabs in one browser context form one call (see group-call.spec.ts); the first tab's
// stage arrangement is checked. Set STAGE_SHOTS to a folder to also save screenshots of it.

test.describe.configure({ timeout: 120_000 });

test("the stage shows names, a host action and the other participants", async ({ context }) => {
  const [alice, bob, carol] = await openCallers(
    context,
    [
      { user: "alice", name: "Alice" },
      { user: "bob", name: "Bob" },
      { user: "carol", name: "Carol" },
    ],
    `&stage=1&locale=${process.env.STAGE_LOCALE ?? "en"}`,
  );

  await openConversation(alice!, "c1");
  await alice!.getByTestId("chat-start-call").click();
  await expect(alice!.getByTestId("call-stage")).toBeVisible();
  for (const page of [bob!, carol!]) {
    await openConversation(page, "c1");
    const join = page.getByTestId("chat-join-call");
    await expect(join).toBeEnabled({ timeout: 20_000 });
    await join.click();
  }
  await expectRemoteCount(alice!, 2);
  expect(await callSession(alice!)).not.toBeNull();

  const stage = alice!.getByTestId("call-stage");
  await expect(stage).toContainText(/Bob|Carol/);
  await expect(stage.getByTestId("call-stage-more")).toBeHidden();
  await expect(stage.getByTestId("call-stage-members")).toHaveCount(0);

  const action = stage.getByTestId("call-stage-action");
  await expect(action).toHaveAttribute("aria-pressed", "false");
  await action.click();
  await expect(action).toHaveAttribute("aria-pressed", "true");

  await alice!.setViewportSize({ width: 390, height: 844 });
  await stage.getByTestId("call-stage-count").click();
  await expect(alice!.getByRole("dialog")).toContainText(/Bob|Carol/);
  await alice!.keyboard.press("Escape");
  await expect(alice!.getByRole("dialog")).toHaveCount(0);

  // Phones keep mic, camera and end in the bar; the rest opens from "more".
  const more = stage.getByTestId("call-stage-more");
  await expect(more).toBeVisible();
  await expect(action).toBeHidden();
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await action.click();
  await expect(action).toHaveAttribute("aria-pressed", "false");
  await expect(action).toBeHidden();

  await stage.getByTestId("call-stage-minimize").click();
  await expect(stage).toHaveCount(0);
  await expect(alice!.getByTestId("call-pip")).toHaveCount(0);
  const mini = alice!.getByTestId("call-stage-mini");
  await expect(mini).toBeVisible();
  await expect(mini).not.toContainText(/\{count\}|peopleCount/);

  // The user picks whose video the mini window shows (wide screens only: phones get a strip).
  await alice!.setViewportSize({ width: 1280, height: 800 });
  const people = mini.getByTestId("call-stage-mini-person");
  await expect(people).toHaveCount(3);
  const you = people.filter({ hasText: "You" });
  await you.click();
  await expect(you).toHaveAttribute("aria-pressed", "true");
  await expect(mini.locator(".call-mini-name")).toHaveText("You");
  await mini.getByTestId("call-stage-mini-expand").click();
  await expect(alice!.getByTestId("call-stage")).toBeVisible();

  const dir = process.env.STAGE_SHOTS;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const [name, size] of [
      ["mobile", { width: 390, height: 844 }],
      ["tablet", { width: 820, height: 1180 }],
      ["desktop", { width: 1280, height: 800 }],
    ] as const) {
      await alice!.setViewportSize(size);
      await alice!.waitForTimeout(600);
      await alice!.screenshot({ path: `${dir}/${name}.png` });
    }
  }
});

test("disables camera and mic button actions when no accessible and connected device, and activates them when connected and recognized", async ({ context }) => {
  const [alice] = await openCallers(context, [{ user: "alice", name: "Alice" }], "&stage=1");

  await alice!.evaluate(() => {
    (window as any).__devices = [];
    navigator.mediaDevices.enumerateDevices = async () => (window as any).__devices;
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Requested device not found", "NotFoundError");
    };
  });

  await openConversation(alice!, "c1");
  await alice!.getByTestId("chat-start-call").click();
  const stage = alice!.getByTestId("call-stage");
  await expect(stage).toBeVisible();

  const camBtn = stage.getByTestId("call-stage-camera");
  const micBtn = stage.getByTestId("call-stage-mic");

  await expect(camBtn).toBeDisabled();
  await expect(micBtn).toBeDisabled();

  // Simulate connecting camera and microphone
  await alice!.evaluate(() => {
    (window as any).__devices = [
      { kind: "videoinput", deviceId: "cam-1", label: "Camera 1", toJSON: () => ({}) },
      { kind: "audioinput", deviceId: "mic-1", label: "Mic 1", toJSON: () => ({}) },
    ];
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });

  // Both actions become active
  await expect(camBtn).toBeEnabled();
  await expect(micBtn).toBeEnabled();
});
