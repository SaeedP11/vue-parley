import type { Page, Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openConversation, openHarness } from "./helpers";

// Calls between this build (plain WebRTC) and a tab still on the previous release (simple-peer;
// see e2e/harness/legacy.ts). During a rollout both are live at once, so they must connect.
//
// Who offers is decided by comparing user ids, so the pairings below pick names that put the
// legacy client on each side of that comparison ("zed" sorts after "bob", "aaron" before).

test.describe.configure({ mode: "default", timeout: 120_000 });

interface LegacyWindow {
  __legacy: {
    ready: boolean;
    streams: { from: string; kind: "video" | "screen"; id: string }[];
    closed: string[];
    peerCount: () => number;
    shareScreen: () => Promise<void>;
    leave: () => void;
  };
}

async function openLegacy(page: Page, user: string) {
  await page.goto(`/legacy.html?user=${user}&name=${user}`);
  await page.waitForFunction(() => (window as unknown as LegacyWindow).__legacy?.ready);
}

const legacy = <T>(page: Page, fn: (l: LegacyWindow["__legacy"]) => T) =>
  page.evaluate(`(${fn.toString()})(window.__legacy)`) as Promise<T>;

async function startCall(page: Page) {
  await openConversation(page, "c1");
  await page.getByTestId("chat-start-call").click();
  await expect(page.getByTestId("call-view")).toBeVisible();
}

async function expectPlayingVideo(video: Locator) {
  await expect
    .poll(
      () =>
        video.evaluate((el: HTMLVideoElement) => {
          const track = (el.srcObject as MediaStream | null)?.getVideoTracks()[0];
          return !!track && track.readyState === "live" && el.videoWidth > 0;
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function expectConnected(current: Page, old: Page) {
  const remote = current.getByTestId("call-remote-video");
  await expect(remote).toHaveCount(1, { timeout: 20_000 });
  await expectPlayingVideo(remote.locator("video"));
  await expectPlayingVideo(old.getByTestId("legacy-remote-video"));
}

test.describe("calls with the previous (simple-peer) release", () => {
  let current: Page;
  let old: Page;

  test.beforeEach(async ({ context }) => {
    current = await context.newPage();
    old = await context.newPage();
  });

  test("legacy joins a call in progress and offers (legacy id is higher)", async () => {
    await openHarness(current, { user: "bob", name: "Bob" });
    await startCall(current);
    await expectPlayingVideo(current.getByTestId("call-local-video"));

    await openLegacy(old, "zed");
    await expectConnected(current, old);
  });

  test("legacy joins a call in progress and answers (legacy id is lower)", async () => {
    await openHarness(current, { user: "bob", name: "Bob" });
    await startCall(current);
    await expectPlayingVideo(current.getByTestId("call-local-video"));

    await openLegacy(old, "aaron");
    await expectConnected(current, old);
  });

  test("this build joins a legacy call in progress", async () => {
    // With the old logic, a waiting participant only ever reaches newcomers it would offer to,
    // so the legacy side must sort higher here (as between two legacy tabs today).
    await openLegacy(old, "zed");
    await openHarness(current, { user: "bob", name: "Bob" });
    await startCall(current);
    await expectConnected(current, old);
  });

  test("screen sharing reaches the legacy client (this build answers)", async () => {
    await openHarness(current, { user: "bob", name: "Bob" });
    await startCall(current);
    await openLegacy(old, "zed");
    await expectConnected(current, old);

    // Bob is not the initiator: the share goes through a renegotiate/transceiver request.
    await current.getByTestId("call-toggle-screen").click();
    await expect
      .poll(() => legacy(old, (l) => l.streams.filter((s) => s.kind === "screen").length), {
        timeout: 20_000,
      })
      .toBe(1);
    await expectPlayingVideo(old.getByTestId("legacy-remote-screen"));
  });

  test("screen sharing from the legacy client reaches this build", async () => {
    await openHarness(current, { user: "bob", name: "Bob" });
    await startCall(current);
    await openLegacy(old, "zed");
    await expectConnected(current, old);

    await legacy(old, (l) => l.shareScreen());
    const screen = current.getByTestId("call-remote-screen");
    await expect(screen).toHaveCount(1, { timeout: 20_000 });
    await expectPlayingVideo(screen.locator("video"));
  });

  test("hanging up here closes the legacy side's connection", async () => {
    await openHarness(current, { user: "bob", name: "Bob" });
    await startCall(current);
    await openLegacy(old, "zed");
    await expectConnected(current, old);

    await current.getByTestId("call-end").click();
    // The legacy build ignores `hangup`; it relies on simple-peer's data channel closing.
    await expect.poll(() => legacy(old, (l) => l.peerCount()), { timeout: 15_000 }).toBe(0);
    await expect(old.getByTestId("legacy-remote-video")).toHaveCount(0);
  });

  test("the legacy side leaving removes its tile here", async () => {
    await openHarness(current, { user: "bob", name: "Bob" });
    await startCall(current);
    await openLegacy(old, "zed");
    await expectConnected(current, old);

    await legacy(old, (l) => l.leave());
    await expect(current.getByTestId("call-remote-video")).toHaveCount(0, { timeout: 15_000 });
    await expect(current.getByTestId("call-participants")).toContainText("1");
  });
});
