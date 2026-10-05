import type { Page, Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openConversation, openHarness, type HarnessWindow } from "./helpers";

// Two tabs in one browser context share a BroadcastChannel, which the harness uses as the call
// signalling bus. Media comes from Chromium's fake camera/mic, and the peers connect directly
// over host candidates (the fake handlers set iceTransportPolicy "all"), so this exercises the
// real WebRTC path.

async function startCall(page: Page) {
  await openConversation(page, "c1");
  await page.getByTestId("chat-start-call").click();
  await expect(page.getByTestId("call-view")).toBeVisible();
}

/** Resolves once the <video> is actually rendering frames from a live stream. */
async function expectPlayingVideo(video: Locator) {
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
      { timeout: 20_000 },
    )
    .toBe(true);
}

/** Puts `first` in the call, waits until it is set up, then brings in `second`. */
async function joinBoth(first: Page, second: Page) {
  await startCall(first);
  await expectPlayingVideo(first.getByTestId("call-local-video"));
  await startCall(second);
}

function published(page: Page) {
  return page.evaluate(() =>
    (window as unknown as HarnessWindow).__harness.published.map((m) => m.type),
  );
}

// Each test runs two browsers with live media: run them one after another in a single worker, so
// they don't starve each other (or the chat tests running alongside).
test.describe.configure({ mode: "default", timeout: 120_000 });

test.describe("video call", () => {
  let alice: Page;
  let bob: Page;

  test.beforeEach(async ({ context }) => {
    alice = await context.newPage();
    bob = await context.newPage();
    await openHarness(alice, { user: "alice", name: "Alice" });
    await openHarness(bob, { user: "bob", name: "Bob" });
  });

  test("a single participant sees their own camera", async () => {
    await startCall(alice);
    await expectPlayingVideo(alice.getByTestId("call-local-video"));
    await expect(alice.getByTestId("call-participants")).toContainText("1");

    const types = await published(alice);
    expect(types).toContain("track_type");
    expect(types).toContain("call");
    expect(types).toContain("join");
  });

  // Peers pick the offerer by comparing user ids ("bob:…" > "alice:…"), and only whoever is
  // already in the call hears the newcomer's join. Both orders must connect.
  for (const order of ["bob first", "alice first"] as const) {
    test(`two participants connect and see each other (${order})`, async () => {
      const [first, second] = order === "bob first" ? [bob, alice] : [alice, bob];
      await joinBoth(first, second);

      for (const [me, other] of [
        [alice, "Bob"],
        [bob, "Alice"],
      ] as const) {
        const remote = me.getByTestId("call-remote-video");
        await expect(remote).toHaveCount(1, { timeout: 20_000 });
        await expect(remote).toContainText(other);
        await expectPlayingVideo(remote.locator("video"));
        await expect(me.getByTestId("call-participants")).toContainText("2");
      }

      // Signalling went through the offer/answer exchange.
      expect(await published(alice)).toContain("signal");
      expect(await published(bob)).toContain("signal");
    });
  }

  test("mute and camera toggles disable the local tracks", async () => {
    await startCall(alice);
    await expectPlayingVideo(alice.getByTestId("call-local-video"));

    const localTrack = (kind: "audio" | "video") =>
      alice
        .getByTestId("call-local-video")
        .evaluate(
          (el: HTMLVideoElement, kind) =>
            (el.srcObject as MediaStream)
              .getTracks()
              .find((t) => t.kind === kind)?.enabled,
          kind,
        );

    const audio = alice.getByTestId("call-toggle-audio");
    await audio.click();
    await expect(audio).toHaveAttribute("data-active", "false");
    expect(await localTrack("audio")).toBe(false);
    await audio.click();
    await expect(audio).toHaveAttribute("data-active", "true");
    expect(await localTrack("audio")).toBe(true);

    const video = alice.getByTestId("call-toggle-video");
    await video.click();
    await expect(video).toHaveAttribute("data-active", "false");
    expect(await localTrack("video")).toBe(false);
    await video.click();
    await expect(video).toHaveAttribute("data-active", "true");
    expect(await localTrack("video")).toBe(true);
  });

  test("Meet's shortcuts toggle the microphone and camera, and the more menu holds the rest", async () => {
    await startCall(alice);
    await expectPlayingVideo(alice.getByTestId("call-local-video"));
    const audio = alice.getByTestId("call-toggle-audio");
    const video = alice.getByTestId("call-toggle-video");

    await alice.keyboard.press("Control+d");
    await expect(audio).toHaveAttribute("data-active", "false");
    await alice.keyboard.press("Control+e");
    await expect(video).toHaveAttribute("data-active", "false");
    await alice.keyboard.press("Control+d");
    await expect(audio).toHaveAttribute("data-active", "true");

    // Minimized, the keys are the browser's again.
    await alice.getByTestId("call-minimize").click();
    await alice.keyboard.press("Control+d");
    await alice.getByTestId("call-maximize").click();
    await expect(audio).toHaveAttribute("data-active", "true");

    await alice.getByTestId("call-more").click();
    await expect(alice.getByRole("menuitem", { name: "Full screen" })).toBeVisible();
  });

  test("the remote side keeps receiving video across camera toggles", async () => {
    await joinBoth(bob, alice);
    const remote = bob.getByTestId("call-remote-video").locator("video");
    await expectPlayingVideo(remote);

    await alice.getByTestId("call-toggle-video").click();
    await alice.getByTestId("call-toggle-video").click();
    await expectPlayingVideo(remote);
  });

  test("screen sharing reaches the other participant", async () => {
    await joinBoth(bob, alice);
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(1, {
      timeout: 20_000,
    });

    const share = alice.getByTestId("call-toggle-screen");
    await share.click();
    await expect(share).toHaveAttribute("data-active", "true");

    const remoteScreen = bob.getByTestId("call-remote-screen");
    await expect(remoteScreen).toHaveCount(1, { timeout: 20_000 });
    await expect(remoteScreen).toContainText("Alice");
    await expectPlayingVideo(remoteScreen.locator("video"));

    await share.click();
    await expect(share).toHaveAttribute("data-active", "false");
    // The stopped share's tile goes away instead of freezing on its last frame.
    await expect(remoteScreen).toHaveCount(0, { timeout: 20_000 });
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(1);
  });

  test("minimize to picture-in-picture and restore", async () => {
    await startCall(alice);

    await alice.getByTestId("call-minimize").click();
    await expect(alice.getByTestId("call-pip")).toBeVisible();
    await expect(alice.getByTestId("call-view")).toBeHidden();
    // The chat stays usable underneath.
    await expect(alice.getByTestId("chat-input")).toBeVisible();

    await alice.getByTestId("call-maximize").click();
    await expect(alice.getByTestId("call-view")).toBeVisible();
    await expect(alice.getByTestId("call-pip")).toHaveCount(0);
    await expectPlayingVideo(alice.getByTestId("call-local-video"));
  });

  test("the call carries on while its view is unmounted", async () => {
    await joinBoth(bob, alice);
    await expect(alice.getByTestId("call-remote-video")).toHaveCount(1, {
      timeout: 20_000,
    });

    const setRenderCall = (value: boolean) =>
      bob.evaluate(
        (v) => (window as unknown as HarnessWindow).__harness.setRenderCall(v),
        value,
      );

    // Bob navigates away from the chat: his call view goes, the call must not.
    await setRenderCall(false);
    await expect(bob.getByTestId("call-view")).toHaveCount(0);
    await alice.waitForTimeout(1_000);
    await expect(alice.getByTestId("call-remote-video")).toHaveCount(1);
    await expectPlayingVideo(alice.getByTestId("call-remote-video").locator("video"));

    // Back again: the same call, still connected.
    await setRenderCall(true);
    await expect(bob.getByTestId("call-view")).toBeVisible();
    await expectPlayingVideo(bob.getByTestId("call-local-video"));
    await expectPlayingVideo(bob.getByTestId("call-remote-video").locator("video"));
    await expect(bob.getByTestId("call-participants")).toContainText("2");
  });

  test("hanging up from picture-in-picture ends the call properly", async () => {
    await joinBoth(bob, alice);
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(1, {
      timeout: 20_000,
    });
    const stream = await alice
      .getByTestId("call-local-video")
      .evaluateHandle((el: HTMLVideoElement) => el.srcObject as MediaStream);

    await alice.getByTestId("call-minimize").click();
    await alice.getByTestId("call-pip-end").click();

    await expect(alice.getByTestId("call-pip")).toHaveCount(0);
    expect(await published(alice)).toContain("hangup");
    expect(
      await stream.evaluate((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test("hanging up tears the call down on both sides", async () => {
    await joinBoth(bob, alice);
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(1, {
      timeout: 20_000,
    });

    const stream = await alice
      .getByTestId("call-local-video")
      .evaluateHandle((el: HTMLVideoElement) => el.srcObject as MediaStream);

    await alice.getByTestId("call-end").click();

    await expect(alice.getByTestId("call-view")).toHaveCount(0);
    expect(
      await alice.evaluate(
        () => (window as unknown as HarnessWindow).__harness.callStore.isActive,
      ),
    ).toBe(false);
    expect(await published(alice)).toContain("hangup");
    // Camera and mic are released.
    expect(
      await stream.evaluate((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ).toBe(true);

    // Bob's peer closes and Alice's tile goes away.
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(bob.getByTestId("call-participants")).toContainText("1");
  });

  // Peers used to wait for a local stream, so a participant without one (an http:// origin, where
  // browsers expose no media devices, or a refused camera) never connected and received nothing.
  // "bob:…" > "alice:…", so Bob makes the offers: cover the media-less side as either role.
  for (const who of ["alice", "bob"] as const) {
    test(`${who} without media devices still receives the other side`, async () => {
      const [deaf, other] = who === "alice" ? [alice, bob] : [bob, alice];
      // What an insecure origin looks like: no navigator.mediaDevices at all.
      await deaf.addInitScript(() =>
        Object.defineProperty(Navigator.prototype, "mediaDevices", { get: () => undefined }),
      );
      await openHarness(deaf, who === "alice" ? { user: "alice", name: "Alice" } : { user: "bob", name: "Bob" });

      await joinBoth(other, deaf);

      const remote = deaf.getByTestId("call-remote-video");
      await expect(remote).toHaveCount(1, { timeout: 20_000 });
      await expectPlayingVideo(remote.locator("video"));
      await expect(other.getByTestId("call-participants")).toContainText("2", { timeout: 20_000 });
      // Nothing to show from the media-less side.
      await expect(other.getByTestId("call-remote-video")).toHaveCount(0);
    });

    test(`${who} with the camera refused still sends audio and receives video`, async () => {
      const [muted, other] = who === "alice" ? [alice, bob] : [bob, alice];
      // The camera permission is set to "blocked": the browser reports it denied, and refuses it.
      await muted.addInitScript(() => {
        const query = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (d) =>
          d.name === ("camera" as PermissionName)
            ? Promise.resolve({ state: "denied" } as PermissionStatus)
            : query(d);
        const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (c) =>
          c?.video
            ? Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
            : gum(c);
      });
      await openHarness(muted, who === "alice" ? { user: "alice", name: "Alice" } : { user: "bob", name: "Bob" });

      await joinBoth(other, muted);

      const remote = muted.getByTestId("call-remote-video");
      await expect(remote).toHaveCount(1, { timeout: 20_000 });
      await expectPlayingVideo(remote.locator("video"));

      const fromMuted = other.getByTestId("call-remote-video");
      await expect(fromMuted).toHaveCount(1, { timeout: 20_000 });
      await expect
        .poll(
          () =>
            fromMuted.locator("video").evaluate((el: HTMLVideoElement) => {
              const stream = el.srcObject as MediaStream | null;
              return stream?.getAudioTracks()[0]?.readyState ?? null;
            }),
          { timeout: 20_000 },
        )
        .toBe("live");
    });
  }

  test("a participant can rejoin after hanging up", async () => {
    await joinBoth(bob, alice);
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(1, {
      timeout: 20_000,
    });

    await alice.getByTestId("call-end").click();
    await expect(bob.getByTestId("call-remote-video")).toHaveCount(0, {
      timeout: 20_000,
    });

    await alice.getByTestId("chat-start-call").click();
    await expect(alice.getByTestId("call-remote-video")).toHaveCount(1, {
      timeout: 20_000,
    });
    await expectPlayingVideo(
      bob.getByTestId("call-remote-video").locator("video"),
    );
  });
});
