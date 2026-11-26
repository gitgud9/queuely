import { expect, test } from "@playwright/test";

test("chat page sends the conversation and shows the reply", async ({ page }) => {
  let body: { messages: { role: string; content: string }[] } | null = null;
  // Stand in for Claude so the test is free and deterministic.
  await page.route("**/api/chat", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { reply: "Gaming has the shortest wait: any moment now.", toolsUsed: ["get_live_queues"], source: "gemini" } });
  });
  await page.goto("/");
  await page.getByTestId("assistant-link").click();
  await page.getByRole("button", { name: "Which queue is shortest right now?" }).click();
  await expect(page.getByTestId("msg-assistant")).toHaveText("Gaming has the shortest wait: any moment now.");
  expect(body!.messages).toEqual([{ role: "user", content: "Which queue is shortest right now?" }]);

  await page.getByLabel("Your question").fill("And VR?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("msg-user")).toHaveCount(2);
  expect(body!.messages).toHaveLength(3);
});

test("with no AI key, the chat still answers from live data", async ({ request }) => {
  const res = await request.post("/api/chat", { data: { messages: [{ role: "user", content: "Which queue is shortest?" }] } });
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.source).toBe("quick");
  expect(data.reply).toMatch(/shortest wait/);
  expect(data.note).toMatch(/no AI key/);
});
