import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectPlayingVideo, openConversation, openHarness } from "./helpers";

// Chromium's fake device is a single camera with no facing, so the page is made into a phone with
// a camera on each side: an Android user agent, two cameras listed, and tracks that say which side
// they face. Frames still come from the fake camera. `window.__failBack` makes the back camera
// refuse to open.

function fakePhone(page: Page) {
  return page.addInitScript(() => {
    type Facing = "user" | "environment";
    const w = window as unknown as { __failBack?: boolean; __open: Facing[] };
    w.__open = [];
    Object.defineProperty(navigator, "userAgent", {
      get: () => "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile",
    });

    const devices = navigator.mediaDevices;
    const enumerate = devices.enumerateDevices.bind(devices);
    const getUserMedia = devices.getUserMedia.bind(devices);
    const ids: Record<Facing, string> = { user: "front-cam", environment: "back-cam" };

    devices.enumerateDevices = async () => {
      const others = (await enumerate()).filter((d) => d.kind !== "videoinput");
      const camera = (facing: Facing) =>
        ({ kind: "videoinput", deviceId: ids[facing], groupId: facing, label: facing,
           toJSON: () => ({}) }) as MediaDeviceInfo;
      return [...others, camera("user"), camera("environment")];
    };

    devices.getUserMedia = async (constraints) => {
      const video = constraints?.video;
      if (!video) return getUserMedia(constraints);
      const wanted = typeof video === "object" ? video : {};
      const exact = (c: unknown) => (c as { exact?: string } | undefined)?.exact;
      const facing: Facing =
        exact(wanted.facingMode) === "environment" || exact(wanted.deviceId) === ids.environment
          ? "environment"
          : "user";
      if (facing === "environment" && w.__failBack) {
        throw new DOMException("Could not start video source", "NotReadableError");
      }
      // Only one camera at a time, as on a phone.
      if (w.__open.length) throw new DOMException("Camera busy", "NotReadableError");

      const stream = await getUserMedia({ ...constraints, video: true });
      const track = stream.getVideoTracks()[0]!;
      const settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), facingMode: facing, deviceId: ids[facing] });
      const stop = track.stop.bind(track);
      track.stop = () => {
        w.__open = w.__open.filter((f) => f !== facing);
        stop();
      };
      w.__open.push(facing);
      return stream;
    };
  });
}

async function startCall(page: Page) {
  await openConversation(page, "c1");
  await page.getByTestId("chat-start-call").click();
  await expect(page.getByTestId("call-view")).toBeVisible();
  await expectPlayingVideo(page.getByTestId("call-local-video"));
}

const isMirrored = (page: Page) =>
  page.getByTestId("call-local-video").evaluate((el) => el.classList.contains("-scale-x-100"));

test.describe.configure({ mode: "default", timeout: 120_000 });

test.describe("video call — flipping the camera", () => {
  let alice: Page;

  test.beforeEach(async ({ context }) => {
    alice = await context.newPage();
    await fakePhone(alice);
    await openHarness(alice, { user: "alice", name: "Alice" });
  });

  test("a phone flips between its front and back cameras", async ({ context }) => {
    const bob = await context.newPage();
    await openHarness(bob, { user: "bob", name: "Bob" });
    await startCall(alice);
    await openConversation(bob, "c1");
    await bob.getByTestId("chat-join-call").click();
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(1, { timeout: 20_000 });

    const flip = alice.getByTestId("call-flip-camera");
    // A phone flips instead of listing its cameras.
    await expect(alice.getByRole("button", { name: "Choose camera" })).toHaveCount(0);
    await expect(flip).toHaveAttribute("data-facing", "user");
    await expect(flip).toHaveAccessibleName("Switch to back camera");
    expect(await isMirrored(alice)).toBe(true);

    await flip.click();
    await expect(flip).toHaveAttribute("data-facing", "environment");
    await expect(flip).toHaveAccessibleName("Switch to front camera");
    await expectPlayingVideo(alice.getByTestId("call-local-video"));
    // The world through the back camera isn't a mirror.
    expect(await isMirrored(alice)).toBe(false);
    // The other side keeps receiving video from the new camera.
    await expectPlayingVideo(bob.getByTestId("call-remote-video").locator("video"));

    await flip.click();
    await expect(flip).toHaveAttribute("data-facing", "user");
    await expectPlayingVideo(alice.getByTestId("call-local-video"));
    expect(await isMirrored(alice)).toBe(true);
  });

  test("a back camera that won't open leaves the front one on", async () => {
    await startCall(alice);
    await alice.evaluate(() => ((window as unknown as { __failBack: boolean }).__failBack = true));

    const flip = alice.getByTestId("call-flip-camera");
    await flip.click();
    await expect(alice.getByText("Error accessing camera")).toBeVisible();
    await expect(flip).toHaveAttribute("data-facing", "user");
    await expectPlayingVideo(alice.getByTestId("call-local-video"));
  });

  test("the flip waits for the camera to be on", async () => {
    await startCall(alice);
    await alice.getByTestId("call-toggle-video").click();
    await expect(alice.getByTestId("call-flip-camera")).toBeDisabled();
  });
});
