import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openCallers, openConversation } from "./helpers";

test.describe.configure({ timeout: 120_000 });

/** Width of the frame a video shows, 0 while it has none. */
const frameWidth = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.videoWidth);

test("an idle shared screen keeps its picture when it moves between the main view and the strip", async ({ context }) => {
  // A real desktop sends frames only when it changes: this one changes for three seconds, then idles.
  await context.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const g = canvas.getContext("2d")!;
      let n = 0;
      const timer = setInterval(() => {
        g.fillStyle = n++ % 2 ? "#1d4ed8" : "#1e40af";
        g.fillRect(0, 0, 1280, 720);
        if (n > 30) clearInterval(timer);
      }, 100);
      return canvas.captureStream();
    };
  });

  const [alice, bob] = await openCallers(
    context,
    [
      { user: "alice", name: "Alice" },
      { user: "bob", name: "Bob" },
    ],
    "&stage=1&locale=en",
  );
  await openConversation(alice!, "c1");
  await alice!.getByTestId("chat-start-call").click();
  await openConversation(bob!, "c1");
  const join = bob!.getByTestId("chat-join-call");
  await expect(join).toBeEnabled({ timeout: 20_000 });
  await join.click();

  const stage = alice!.getByTestId("call-stage");
  await expect(stage.locator(".call-main-footer")).toContainText("Bob", { timeout: 30_000 });
  await bob!.getByTestId("call-stage-screen-share").click();
  const mainScreen = stage.getByTestId("call-stage-screen").locator("video");
  await expect.poll(() => frameWidth(mainScreen), { timeout: 20_000 }).toBeGreaterThan(0);
  await alice!.waitForTimeout(4_000);

  await stage.getByRole("button", { name: "Show Bob in the main view" }).click();
  const screenTile = stage.getByTestId("call-stage-screen-tile");
  await expect(stage.locator(".call-main-footer")).toContainText("Bob");
  await expect.poll(() => frameWidth(screenTile.locator("video"))).toBeGreaterThan(0);

  await screenTile.getByRole("button", { name: "Show in main view" }).click();
  await expect.poll(() => frameWidth(mainScreen)).toBeGreaterThan(0);
});

test("alone in a call, the presenter can move their screen out of the main view and back", async ({ context }) => {
  await context.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const g = canvas.getContext("2d")!;
      setInterval(() => g.fillRect(0, 0, 640, 360), 100);
      return canvas.captureStream();
    };
  });

  const [alice] = await openCallers(context, [{ user: "alice", name: "Alice" }], "&stage=1&locale=en");
  await openConversation(alice!, "c1");
  await alice!.getByTestId("chat-start-call").click();

  const stage = alice!.getByTestId("call-stage");
  await alice!.getByTestId("call-stage-screen-share").click();
  await expect(stage.getByTestId("call-stage-screen")).toBeVisible({ timeout: 20_000 });

  await stage.getByRole("button", { name: "Show Alice in the main view" }).click();
  const screenTile = stage.getByTestId("call-stage-screen-tile");
  await expect(screenTile).toBeVisible();
  await expect(stage.locator(".call-others-title")).toHaveCount(0);

  await screenTile.getByRole("button", { name: "Show in main view" }).click();
  await expect(stage.getByTestId("call-stage-screen")).toBeVisible();
});
