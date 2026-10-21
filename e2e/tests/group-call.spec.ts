import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  callSession,
  expectPlayingVideo,
  expectRemoteCount,
  openCallers,
  openConversation,
  remoteTiles,
  type HarnessWindow,
} from "./helpers";

// Three or four tabs in one browser context share the harness's BroadcastChannel call bus, so
// they form one call on conversation c1, each tab connected to every other one (a mesh). Media
// is Chromium's fake camera and mic.

const ALICE = { user: "alice", name: "Alice" };
const BOB = { user: "bob", name: "Bob" };
const CAROL = { user: "carol", name: "Carol" };
const DAVE = { user: "dave", name: "Dave" };

/** Starts a call on c1 and waits until the user's own camera plays. */
async function startCall(page: Page) {
  await openConversation(page, "c1");
  await page.getByTestId("chat-start-call").click();
  await expect(page.getByTestId("call-view")).toBeVisible();
  await expectPlayingVideo(page.getByTestId("call-local-video"));
}

/** Joins the call others are in on c1, from the conversation's header. */
async function joinCall(page: Page) {
  await openConversation(page, "c1");
  const join = page.getByTestId("chat-join-call");
  await expect(join).toBeEnabled({ timeout: 20_000 });
  await join.click();
  await expect(page.getByTestId("call-view")).toBeVisible();
}

/** The first page starts the call, the others join it one after another. */
async function callTogether(pages: Page[]) {
  const [first, ...rest] = pages;
  await startCall(first!);
  for (const page of rest) await joinCall(page);
  for (const page of pages) await expectRemoteCount(page, pages.length - 1);
}

const selfId = async (page: Page) => (await callSession(page))!.selfId;

test.describe.configure({ mode: "default", timeout: 180_000 });

test.describe("group call — connection", () => {
  let alice: Page;
  let bob: Page;
  let carol: Page;

  test.beforeEach(async ({ context }) => {
    [alice, bob, carol] = await openCallers(context, [ALICE, BOB, CAROL]);
  });

  // Who offers is decided per pair by comparing ids, and only those already in the call hear a
  // newcomer's join: every order must connect everyone.
  for (const order of ["abc", "bca", "cab"] as const) {
    test(`three people connect to each other (join order ${order})`, async () => {
      const byLetter = { a: alice, b: bob, c: carol };
      await callTogether([...order].map((letter) => byLetter[letter as "a" | "b" | "c"]));
      for (const page of [alice, bob, carol])
        await expect(page.getByTestId("call-participants")).toContainText("3");
    });
  }

  test("someone joining late connects to everyone already there", async () => {
    await callTogether([alice, bob]);
    await joinCall(carol);
    for (const page of [alice, bob, carol]) await expectRemoteCount(page, 2);
  });

  test("one person hanging up leaves the others connected", async () => {
    await callTogether([alice, bob, carol]);
    await bob.getByTestId("call-end").click();

    for (const page of [alice, carol]) await expectRemoteCount(page, 1);
    // Still in the call, and still connected, a while later.
    await alice.waitForTimeout(5_000);
    for (const page of [alice, carol]) {
      await expect(page.getByTestId("call-view")).toBeVisible();
      await expectRemoteCount(page, 1);
    }
  });

  test("a closed tab drops out without disturbing the others", async () => {
    await callTogether([alice, bob, carol]);
    await bob.close();

    for (const page of [alice, carol]) await expectRemoteCount(page, 1, 45_000);
    await expect(alice.getByTestId("call-remote-video")).not.toContainText("Bob");
  });

  test("someone who hangs up can join again", async () => {
    await callTogether([alice, bob, carol]);
    await bob.getByTestId("call-end").click();
    for (const page of [alice, carol]) await expectRemoteCount(page, 1);

    await joinCall(bob);
    for (const page of [alice, bob, carol]) await expectRemoteCount(page, 2);
  });

  test("mute, camera and screen share reach everyone", async () => {
    await callTogether([alice, bob, carol]);
    const carolId = await selfId(carol);

    await carol.getByTestId("call-toggle-audio").click();
    await carol.getByTestId("call-toggle-video").click();
    await carol.getByTestId("call-toggle-screen").click();

    for (const page of [alice, bob]) {
      const screen = page.getByTestId("call-remote-screen");
      await expect(screen).toHaveCount(1, { timeout: 20_000 });
      await expect(screen).toContainText("Carol");
      await expectPlayingVideo(screen.locator("video"));
      await expect
        .poll(async () => {
          const session = await callSession(page);
          return session?.participants.find((p) => p.id === carolId)?.media;
        })
        .toEqual({ audio: false, video: false });
    }
  });
});

test.describe("group call — per-pair recovery", () => {
  test("one failed pair reconnects without touching the other pairs", async ({ context }) => {
    const [alice, bob, carol] = await openCallers(context, [ALICE, BOB, CAROL]);
    await callTogether([alice!, bob!, carol!]);
    const bobId = await selfId(bob!);
    const before = (await callSession(carol!))!.peerIds;
    expect(Object.keys(before)).toHaveLength(2);

    await alice!.evaluate(
      (id) => (window as unknown as HarnessWindow).__harness.failPeer(id),
      bobId,
    );

    // Alice and Bob find each other again (SC-003)…
    await expect
      .poll(async () => (await callSession(alice!))?.peerStatus[bobId], { timeout: 15_000 })
      .toBe("connected");
    for (const page of [alice!, bob!]) await expectRemoteCount(page, 2, 15_000);
    // …while Carol's connections to both are the very same ones as before.
    expect((await callSession(carol!))!.peerIds).toEqual(before);
    await expectRemoteCount(carol!, 2);
  });
});

test.describe("group call — simultaneous start", () => {
  test("two people starting at once end up in one call", async ({ context }) => {
    const [alice, bob, carol] = await openCallers(context, [ALICE, BOB, CAROL]);
    await openConversation(alice!, "c1");
    await openConversation(bob!, "c1");
    await Promise.all([
      alice!.getByTestId("chat-start-call").click(),
      bob!.getByTestId("chat-start-call").click(),
    ]);
    await joinCall(carol!);

    for (const page of [alice!, bob!, carol!]) await expectRemoteCount(page, 2);
    for (const page of [alice!, bob!, carol!]) {
      expect(
        await page.evaluate(
          () => (window as unknown as HarnessWindow).__harness.callStore.channelId,
        ),
      ).toBe("c1");
    }
  });
});

/** The tile showing `participantId`'s camera (or their screen, with `kind: "screen"`). */
const tileOf = (page: Page, participantId: string, kind = "camera") =>
  page.locator(`[data-testid="call-tile"][data-participant-id="${participantId}"][data-kind="${kind}"]`);

const area = async (locator: ReturnType<Page["locator"]>) => {
  const box = await locator.boundingBox();
  return box ? box.width * box.height : 0;
};

test.describe("group call — screen", () => {
  let alice: Page;
  let bob: Page;
  let carol: Page;
  let dave: Page;

  test.beforeEach(async ({ context }) => {
    [alice, bob, carol, dave] = await openCallers(context, [ALICE, BOB, CAROL, DAVE]);
    await callTogether([alice, bob, carol, dave]);
  });

  test("tiles show who is who, who is muted and whose camera is off", async () => {
    const bobId = await selfId(bob);
    const carolId = await selfId(carol);

    await bob.getByTestId("call-toggle-video").click();
    await carol.getByTestId("call-toggle-audio").click();

    for (const page of [alice, dave]) {
      await expect(tileOf(page, bobId).getByTestId("call-tile-avatar")).toBeVisible({ timeout: 10_000 });
      await expect(tileOf(page, carolId).getByTestId("call-tile-muted")).toBeVisible({ timeout: 10_000 });
      await expect(tileOf(page, carolId).getByTestId("call-tile-avatar")).toHaveCount(0);
      await expect(tileOf(page, bobId)).toContainText("Bob");
    }

    // The top bar names the conversation and counts everyone.
    await expect(alice.getByTestId("call-top-bar")).toContainText("Sara Ahmadi");
    await expect(alice.getByTestId("call-participant-count")).toHaveText("4");

    // The people list has a row per participant, the user's own marked as theirs.
    await alice.getByTestId("call-people-button").click();
    const list = alice.getByTestId("call-people-list");
    await expect(list).toBeVisible();
    await expect(list.getByTestId("call-participant")).toHaveCount(4);
    await expect(
      list.locator(`[data-testid="call-participant"][data-participant-id="${await selfId(alice)}"]`),
    ).toContainText("(You)");
    await alice.keyboard.press("Escape");
    await expect(list).toBeHidden();
  });

  test("four people fit a phone screen without scrolling", async () => {
    await alice.setViewportSize({ width: 360, height: 740 });
    const tiles = alice.getByTestId("call-tile");
    await expect(tiles).toHaveCount(4);
    // The 2×2 grid settles after the resize.
    await expect
      .poll(async () => {
        const boxes = await Promise.all((await tiles.all()).map((t) => t.boundingBox()));
        return boxes.every(
          (b) => !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 360 && b.y + b.height <= 740 && b.width >= 150,
        );
      })
      .toBe(true);
    expect(
      await alice.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight),
    ).toBe(true);
  });

  test("a screen share takes the stage and the cameras move to the strip", async () => {
    const aliceId = await selfId(alice);
    await alice.getByTestId("call-toggle-screen").click();

    const screen = tileOf(bob, aliceId, "screen");
    await expect(screen).toHaveAttribute("data-stage", "true", { timeout: 20_000 });
    await expectPlayingVideo(screen.locator("video"));
    const strip = bob.getByTestId("call-strip");
    await expect(strip.getByTestId("call-tile")).toHaveCount(4);
    const stage = await area(screen);
    for (const tile of await strip.getByTestId("call-tile").all())
      expect(await area(tile)).toBeLessThan(stage);
  });

  test("a pinned tile takes the stage until it is unpinned", async () => {
    const carolId = await selfId(carol);
    const tile = tileOf(alice, carolId);
    await tile.hover();
    await tile.getByTestId("call-pin").click();
    await expect(tileOf(alice, carolId)).toHaveAttribute("data-stage", "true");
    await expect(tileOf(alice, carolId).getByTestId("call-pin")).toHaveAttribute("aria-pressed", "true");
    await expect(alice.getByTestId("call-strip").getByTestId("call-tile")).toHaveCount(3);

    await tileOf(alice, carolId).hover();
    await tileOf(alice, carolId).getByTestId("call-pin").click();
    await expect(alice.getByTestId("call-strip")).toHaveCount(0);
    await expect(alice.getByTestId("call-tile")).toHaveCount(4);
  });
});

test.describe("group call — notices", () => {
  test("joining and leaving are announced", async ({ context }) => {
    const [alice, bob, carol, dave] = await openCallers(context, [ALICE, BOB, CAROL, DAVE]);
    await callTogether([alice!, bob!, carol!]);

    await joinCall(dave!);
    // Changes close together merge into one notice ("Bob, Carol and Dave joined").
    const notice = (text: string) => alice!.getByTestId("call-notice").filter({ hasText: text });
    await expect(notice("Dave joined")).toBeVisible({ timeout: 20_000 });

    await dave!.getByTestId("call-end").click();
    await expect(notice("Dave left")).toBeVisible({ timeout: 20_000 });
    await expect(alice!.getByTestId("call-notice")).toHaveCount(0, { timeout: 10_000 });
  });

  test("everyone else leaving leaves the user waiting, not hung up", async ({ context }) => {
    const [alice, bob] = await openCallers(context, [ALICE, BOB]);
    await callTogether([alice!, bob!]);
    await bob!.getByTestId("call-end").click();
    const waiting = alice!.getByTestId("call-waiting");
    await expect(waiting).toContainText("Everyone else left", { timeout: 20_000 });
    await expect(waiting).toContainText("Sara Ahmadi");
    await expect(alice!.getByTestId("call-view")).toBeVisible();
  });
});

test.describe("group call — right to left", () => {
  test("the call screen mirrors in Persian", async ({ context }) => {
    const [alice, bob, carol] = await openCallers(context, [ALICE, BOB, CAROL], "&locale=fa");
    await callTogether([alice!, bob!, carol!]);
    const view = alice!.getByTestId("call-view");
    await expect(view).toHaveAttribute("dir", "rtl");

    // A share on the stage, the strip on the inline end: the left in RTL.
    await bob!.getByTestId("call-toggle-screen").click();
    const strip = alice!.getByTestId("call-strip");
    await expect(strip).toBeVisible({ timeout: 20_000 });
    const stage = alice!.locator('[data-testid="call-tile"][data-stage="true"]');
    const [stripBox, stageBox] = [await strip.boundingBox(), await stage.boundingBox()];
    expect(stripBox!.x).toBeLessThan(stageBox!.x);

    // The people drawer opens from the left.
    await alice!.getByTestId("call-people-button").click();
    const list = alice!.getByTestId("call-people-list");
    await expect(list).toBeVisible();
    await expect.poll(async () => (await list.boundingBox())?.x).toBeLessThan(10);
    await expect(list).toContainText("افراد");
  });
});

test.describe("group call — capacity", () => {
  const ERIN = { user: "erin", name: "Erin" };

  test("a full call can't be joined, and the people in it notice nothing", async ({ context }) => {
    const pages = await openCallers(context, [ALICE, BOB, CAROL, DAVE, ERIN]);
    const [alice, bob, carol, dave, erin] = pages as [Page, Page, Page, Page, Page];
    await callTogether([alice, bob, carol, dave]);

    await openConversation(erin, "c1");
    const join = erin.getByTestId("chat-join-call");
    await expect(join).toBeDisabled({ timeout: 20_000 });
    await expect(join).toContainText("Call is full");

    const before = await Promise.all([alice, bob, carol, dave].map(async (p) => (await callSession(p))!.peerIds));
    // Whatever asks for it, the call isn't joined.
    await erin.evaluate(() =>
      (window as unknown as { __harness: { callStore: { startCall: (id: string) => void } } }).__harness.callStore.startCall("c1"),
    );
    await expect(erin.getByText("This call is full (up to 4 people)")).toBeVisible();
    await expect(erin.getByTestId("call-view")).toBeHidden();
    await erin.waitForTimeout(2_000);
    for (const [i, page] of [alice, bob, carol, dave].entries()) {
      await expectRemoteCount(page, 3);
      expect((await callSession(page))!.peerIds).toEqual(before[i]);
    }

    // Someone leaves: there is room again.
    await dave.getByTestId("call-end").click();
    await expect(join).toBeEnabled({ timeout: 20_000 });
    await join.click();
    for (const page of [alice, bob, carol, erin]) await expectRemoteCount(page, 3);
  });

  test("two joining at once into the last place: the later one leaves on their own", async ({ context }) => {
    const [alice, bob, carol, dave] = (await openCallers(
      context,
      [ALICE, BOB, CAROL, DAVE],
      "&max=3",
    )) as [Page, Page, Page, Page];
    await callTogether([alice, bob]);
    await openConversation(carol, "c1");
    await openConversation(dave, "c1");
    await expect(carol.getByTestId("chat-join-call")).toBeEnabled({ timeout: 20_000 });
    await expect(dave.getByTestId("chat-join-call")).toBeEnabled({ timeout: 20_000 });
    await Promise.all([
      carol.getByTestId("chat-join-call").click(),
      dave.getByTestId("chat-join-call").click(),
    ]);

    // Exactly one of the two is turned away, and told why.
    await expect
      .poll(
        async () =>
          (await Promise.all([carol, dave].map((p) => p.getByTestId("call-view").isVisible()))).filter(Boolean)
            .length,
        { timeout: 20_000 },
      )
      .toBe(1);
    const left = (await carol.getByTestId("call-view").isVisible()) ? dave : carol;
    const stayed = left === carol ? dave : carol;
    await expect(left.getByText("This call is full (up to 3 people)")).toBeVisible();
    for (const page of [alice, bob, stayed]) await expectRemoteCount(page, 2);
  });
});

test.describe("group call — network", () => {
  const sendersOf = (page: Page) =>
    page.evaluate(() => (window as unknown as HarnessWindow).__harness.senderParams());

  test("in a group, video is capped per peer and audio comes first", async ({ context }) => {
    const [alice, bob, carol] = await openCallers(context, [ALICE, BOB, CAROL]);
    await callTogether([alice!, bob!, carol!]);
    await expect
      .poll(async () => {
        const senders = Object.values(await sendersOf(alice!)).flat();
        const camera = senders.filter((s) => s.kind === "video" && !s.screen);
        const audio = senders.filter((s) => s.kind === "audio");
        return (
          camera.length === 2 &&
          camera.every((s) => s.encodings[0]?.maxBitrate === 800_000 && s.encodings[0]?.scaleResolutionDownBy === 1.5) &&
          audio.length === 2 &&
          audio.every((s) => s.encodings[0]?.priority === "high")
        );
      }, { timeout: 15_000 })
      .toBe(true);
  });

  test("one to one keeps the browser's own video limits", async ({ context }) => {
    const [alice, bob] = await openCallers(context, [ALICE, BOB]);
    await callTogether([alice!, bob!]);
    await alice!.waitForTimeout(2_000);
    const camera = Object.values(await sendersOf(alice!)).flat().filter((s) => s.kind === "video");
    expect(camera).toHaveLength(1);
    expect(camera[0]!.encodings[0]?.maxBitrate).toBeUndefined();
  });

  test("a pair that can't be rebuilt says so, and Retry reconnects it", async ({ context }) => {
    const [alice, bob, carol] = (await openCallers(context, [ALICE, BOB, CAROL])) as [Page, Page, Page];
    await callTogether([alice, bob, carol]);
    const bobId = await selfId(bob);

    await alice.evaluate((id) => (window as unknown as HarnessWindow).__harness.blockPeer(id), bobId);

    const tile = tileOf(alice, bobId);
    await expect(tile.getByTestId("call-tile-unreachable")).toBeVisible({ timeout: 40_000 });
    await expect(tile).toContainText("Can't connect to Bob");
    await alice.getByTestId("call-people-button").click();
    await expect(
      alice.locator(`[data-testid="call-participant"][data-participant-id="${bobId}"]`),
    ).toContainText("Can't connect to Bob");
    await alice.keyboard.press("Escape");
    // Carol, untouched, still has both.
    await expectRemoteCount(carol, 2);

    await alice.evaluate((id) => (window as unknown as HarnessWindow).__harness.unblockPeer(id), bobId);
    await tile.getByTestId("call-tile-retry").click();
    await expect(tile.getByTestId("call-tile-unreachable")).toHaveCount(0, { timeout: 20_000 });
    for (const page of [alice, bob]) await expectRemoteCount(page, 2, 20_000);
  });
});
