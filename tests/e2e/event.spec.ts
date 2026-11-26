import { expect, test } from "@playwright/test";

test("staff edit the event info and the assistant uses it right away", async ({ page, request }) => {
  await page.goto("/staff");
  await page.getByTestId("pin").fill("1234");
  await page.getByTestId("pin-submit").click();
  await page.getByTestId("tab-event").click();
  await expect(page).toHaveURL(/\/staff\?tab=event$/);

  const editor = page.getByTestId("event-editor");
  await expect(editor.getByText("Sample event (not saved yet)")).toBeVisible();
  await page.getByTestId("event-name").fill("Night Market Demo");

  await page.getByTestId("add-session").click();
  const row = page.getByTestId("session-row").last();
  await row.getByLabel("Start").fill("21:00");
  await row.getByLabel("End").fill("21:30");
  await row.getByLabel("Title").fill("Fireworks");
  await row.getByLabel("Session place").fill("Car park");

  await page.getByTestId("add-place").click();
  const place = page.getByTestId("place-row").last();
  await place.getByLabel("Place name").fill("Lantern Walk");
  await place.getByLabel("Where").fill("Along the river");

  await page.getByTestId("save-event").click();
  await expect(page.getByTestId("event-status")).toContainText("Saved");
  await expect(editor.getByText("Saved", { exact: true })).toBeVisible();

  // No AI key in tests, so the quick answers reply, from the saved event.
  const chat = async (q: string) =>
    (await (await request.post("/api/chat", { data: { messages: [{ role: "user", content: q }] } })).json()).reply as string;
  expect(await chat("What's on at 9pm?")).toMatch(/Fireworks \(Car park, 21:00 to 21:30\)/);
  expect(await chat("Where is the lantern walk?")).toBe("Lantern Walk: Along the river.");

  // Reloading shows the saved version.
  await page.reload();
  await expect(page.getByTestId("event-name")).toHaveValue("Night Market Demo");
});

test("bad event info is rejected with a clear message, and saving needs the PIN", async ({ page, request }) => {
  const noPin = await request.put("/api/event", { data: {} });
  expect(noPin.status()).toBe(401);

  await page.goto("/staff?tab=event");
  await page.getByTestId("pin").fill("1234");
  await page.getByTestId("pin-submit").click();
  await page.getByTestId("tab-event").click();
  await page.getByTestId("event-name").fill("");
  await page.getByTestId("save-event").click();
  await expect(page.getByTestId("event-status")).toHaveText("Event name is required");
});
