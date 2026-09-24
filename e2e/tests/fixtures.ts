import { test as base, expect } from "@playwright/test";

// Vue only warns when a template uses a component or directive nobody registered, and the
// element silently renders as nothing. Every page in a test is watched for that, and the test
// fails if it happens.
const UNRESOLVED = /Failed to resolve (component|directive): ([\w-]+)/;

/** Known gaps, each with a reason. Keep this empty where possible. */
const ALLOWED = new Set([
  // Behayand-specific request cards; the component was never part of this package.
  "RequestCard",
]);

export const test = base.extend({
  context: async ({ context }, use) => {
    const unresolved = new Set<string>();
    context.on("page", (page) =>
      page.on("console", (msg) => {
        const match = msg.text().match(UNRESOLVED);
        if (match && !ALLOWED.has(match[2])) unresolved.add(`${match[1]} ${match[2]}`);
      }),
    );
    await use(context);
    expect([...unresolved], "unregistered components/directives").toEqual([]);
  },
});

export { expect };
