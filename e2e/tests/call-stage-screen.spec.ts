import { expect, test } from "./fixtures";
import { expectRemoteCount, openCallers, openConversation } from "./helpers";

test.describe.configure({ timeout: 120_000 });

test("a tile picked during a screen share takes the main view, and the screen can come back", async ({ context }) => {
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
  await expectRemoteCount(alice!, 1);

  await bob!.getByTestId("call-stage-screen-share").click();

  const stage = alice!.getByTestId("call-stage");
  await expect(stage.getByTestId("call-stage-screen")).toBeVisible({ timeout: 20_000 });
  await expect(stage.getByTestId("call-stage-screen-tile")).toHaveCount(0);

  await stage.getByRole("button", { name: "Show Bob in the main view" }).click();
  await expect(stage.getByTestId("call-stage-screen")).toHaveCount(0);
  await expect(stage.getByTestId("call-stage-screen-tile")).toBeVisible();
  await expect(stage.locator(".call-main-footer")).toContainText("Bob");

  await stage.getByRole("button", { name: "Show Alice in the main view" }).click();
  await expect(stage.getByTestId("call-stage-screen")).toHaveCount(0);
  await expect(stage.locator(".call-main-footer")).toContainText("Alice");

  await stage.getByTestId("call-stage-screen-tile").getByRole("button", { name: "Show in main view" }).click();
  await expect(stage.getByTestId("call-stage-screen")).toBeVisible();
});
