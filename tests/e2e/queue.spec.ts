import { expect, test, type Browser, type Page } from "@playwright/test";

const PIN = "1234";

async function resetBooth(baseURL: string, id: string) {
  const res = await fetch(`${baseURL}/api/booths/${id}/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-staff-pin": PIN },
    body: JSON.stringify({ type: "reset" }),
  });
  expect(res.ok).toBe(true);
}

/** Each visitor gets its own browser context = its own phone (separate localStorage). */
async function newVisitor(browser: Browser, booth: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`/b/${booth}`);
  await expect(page.getByTestId("visitor")).toBeVisible();
  return page;
}

async function joinQueue(page: Page) {
  await page.getByTestId("join").click();
  await expect(page.getByTestId("my-ticket")).toBeVisible();
}

async function openStaff(browser: Browser, booth: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/staff?booth=${booth}`);
  await page.getByTestId("pin").fill(PIN);
  await page.getByTestId("pin-submit").click();
  await expect(page.getByTestId("staff")).toBeVisible();
  await expect(page.getByTestId(`tab-${booth}`)).toHaveAttribute("aria-current", "page");
  return page;
}

test("visitors join, staff call and skip, everyone's screen updates live", async ({ browser, baseURL }) => {
  await resetBooth(baseURL!, "photo"); // 1 station, 90 s per visitor

  const display = await (await browser.newContext()).newPage();
  await display.goto("/display/photo");
  await expect(display.getByTestId("display-next")).toHaveText("nobody waiting");

  const staff = await openStaff(browser, "photo");

  // Three visitors scan the QR code and join.
  const [v1, v2, v3] = [await newVisitor(browser, "photo"), await newVisitor(browser, "photo"), await newVisitor(browser, "photo")];
  await joinQueue(v1);
  await joinQueue(v2);
  await joinQueue(v3);
  await expect(v1.getByTestId("my-number")).toHaveText("PB-001");
  await expect(v3.getByTestId("my-number")).toHaveText("PB-003");
  await expect(v1.getByTestId("my-position")).toHaveText("Next");
  await expect(v3.getByTestId("my-position")).toHaveText("#3");
  // Station is free, so the first person waits only for staff to press the button.
  await expect(v1.getByTestId("my-wait")).toHaveText("Any moment now");
  await expect(v3.getByTestId("my-wait")).toHaveText("~3 min"); // 2 people ahead x 90 s

  // Staff and the public screen see the line without reloading.
  await expect(staff.getByTestId("stat-waiting")).toHaveText("3");
  await expect(display.getByTestId("display-next")).toContainText("PB-001");

  // Call the first visitor.
  await staff.getByTestId("call-next").click();
  await expect(v1.getByTestId("your-turn")).toBeVisible();
  await expect(display.getByTestId("display-serving")).toHaveText("PB-001");
  await expect(v2.getByTestId("my-position")).toHaveText("Next");
  await expect(v3.getByTestId("my-position")).toHaveText("#2");
  await expect(v1).toHaveTitle(/your turn/i);

  // Call next again: on a one-station booth this finishes PB-001.
  await staff.getByTestId("call-next").click();
  await expect(v1.getByTestId("finished")).toContainText("Thanks for visiting");
  await expect(v2.getByTestId("your-turn")).toBeVisible();
  await expect(display.getByTestId("display-serving")).toHaveText("PB-002");

  // PB-002 doesn't show up.
  await staff.getByTestId("skip-2").click();
  await expect(v2.getByTestId("finished")).toContainText("couldn't find you");
  await expect(display.getByTestId("display-serving")).toHaveText("—");

  // PB-003 gives up and leaves.
  await v3.getByTestId("leave").click();
  await expect(v3.getByTestId("join-card")).toBeVisible();
  await expect(staff.getByTestId("stat-waiting")).toHaveText("0");
  await expect(staff.getByTestId("call-next")).toBeDisabled();

  // Staff pause the queue: newcomers can't join, then can again after resume.
  await staff.getByTestId("pause-toggle").click();
  const v4 = await newVisitor(browser, "photo");
  await expect(v4.getByTestId("paused-banner")).toBeVisible();
  await expect(v4.getByTestId("join")).toBeDisabled();
  await staff.getByTestId("pause-toggle").click();
  await expect(v4.getByTestId("join")).toBeEnabled();
  await joinQueue(v4);
  await expect(v4.getByTestId("my-number")).toHaveText("PB-004");

  // A visitor's ticket survives a page reload (it lives in localStorage).
  await v4.reload();
  await expect(v4.getByTestId("my-number")).toHaveText("PB-004");
});

test("a two-station booth serves two visitors at once", async ({ browser, baseURL }) => {
  await resetBooth(baseURL!, "vr");
  const staff = await openStaff(browser, "vr");
  const visitors = [];
  for (let i = 0; i < 3; i++) {
    const v = await newVisitor(browser, "vr");
    await joinQueue(v);
    visitors.push(v);
  }
  await staff.getByTestId("call-next").click();
  await staff.getByTestId("call-next").click();
  await expect(visitors[0].getByTestId("your-turn")).toBeVisible();
  await expect(visitors[1].getByTestId("your-turn")).toBeVisible();
  // Both stations are busy, so the third visitor's wait is about one session (4 min).
  await expect(visitors[2].getByTestId("my-wait")).toHaveText("~4 min");
  await expect(staff.getByTestId("serving-list").locator("li")).toHaveCount(2);
});

test("a rush of 40 people joining at once never shares a ticket number", async ({ baseURL }) => {
  await resetBooth(baseURL!, "gaming");
  const results = await Promise.all(
    Array.from({ length: 40 }, () => fetch(`${baseURL}/api/booths/gaming/join`, { method: "POST" }).then((r) => r.json())),
  );
  const numbers = results.map((r) => r.number).sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
});

test("staff actions need the PIN, and tickets can't be cancelled by strangers", async ({ baseURL }) => {
  const noPin = await fetch(`${baseURL}/api/booths/vr/staff`, { method: "POST", body: JSON.stringify({ type: "reset" }) });
  expect(noPin.status).toBe(401);
  const joined = await (await fetch(`${baseURL}/api/booths/vr/join`, { method: "POST" })).json();
  const forged = await fetch(`${baseURL}/api/booths/vr/leave`, {
    method: "POST",
    body: JSON.stringify({ number: joined.number, joinedAt: joined.joinedAt, token: "guessed-token-123456789" }),
  });
  expect(forged.status).toBe(403);
});

test("guests only see Join, the public screen and QR codes; staff use the PIN-protected portal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("booth-vr")).toBeVisible();
  await expect(page.getByRole("link", { name: "Join queue" })).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Public screen" })).toHaveCount(3);
  await expect(page.getByRole("link", { name: /staff dashboard/i })).toHaveCount(0);

  // The Staff Portal asks for the PIN before showing anything.
  await page.getByTestId("staff-portal").click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByTestId("staff")).toHaveCount(0);
  await page.getByTestId("pin").fill("0000");
  await page.getByTestId("pin-submit").click();
  await expect(page.getByText("Wrong PIN")).toBeVisible();
  await page.getByTestId("pin").fill(PIN);
  await page.getByTestId("pin-submit").click();

  // Staff dashboard only: booth tabs, no Join buttons or QR codes.
  await expect(page.getByTestId("staff")).toContainText("VR Experience");
  await expect(page.getByTestId("join")).toHaveCount(0);
  await expect(page.locator(".qr")).toHaveCount(0);
  await page.getByTestId("tab-gaming").click();
  await expect(page.getByTestId("staff")).toContainText("Gaming Arena");
  await expect(page).toHaveURL(/booth=gaming/);

  // Old per-booth staff links land in the portal.
  await page.goto("/staff/photo");
  await expect(page.getByTestId("staff")).toContainText("Photo Booth");

  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("pin")).toBeVisible();
});
