import { test, expect, type Page } from "@playwright/test";
import { loadEnv } from "vite";
const env = { ...loadEnv("test", process.cwd(), "VITE_"), ...process.env };
test.skip(
  !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY,
  "需要實際 Supabase URL 與公開金鑰；不以 mock 取代共享驗證。",
);
async function draw(page: Page, offset: number) {
  const canvas = page.getByLabel("繪畫畫布");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + offset);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + offset + 20, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByRole("status").filter({ hasText: "儲存中" }),
  ).toHaveCount(0);
}
test("兩個獨立瀏覽器共享燈光、同時筆畫、貼圖、圖片、重整與個人撤回", async ({
  browser,
}) => {
  const a = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const b = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const first = await a.newPage(),
    second = await b.newPage();
  try {
    await Promise.all([first.goto("/"), second.goto("/")]);
    await Promise.all([
      expect(first.getByRole("button", { name: "燈 1" })).toBeEnabled(),
      expect(second.getByRole("button", { name: "燈 1" })).toBeEnabled(),
    ]);
    const initial = await first
      .getByRole("button", { name: "燈 1" })
      .getAttribute("aria-pressed");
    await first.getByRole("button", { name: "燈 1" }).tap();
    await expect(second.getByRole("button", { name: "燈 1" })).toHaveAttribute(
      "aria-pressed",
      String(initial !== "true"),
    );
    const baseline = await first.locator("polyline").count();
    await Promise.all([draw(first, 25), draw(second, 80)]);
    await Promise.all([
      expect(first.locator("polyline")).toHaveCount(baseline + 2),
      expect(second.locator("polyline")).toHaveCount(baseline + 2),
    ]);
    // First user's latest operation is their stroke, even though the other user also drew.
    const ownIds = await first
      .locator("polyline")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-id")),
      );
    await first.getByRole("button", { name: "撤回", exact: true }).tap();
    await expect(second.locator("polyline")).toHaveCount(baseline + 1);
    const remaining = await second
      .locator("polyline")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-id")),
      );
    expect(remaining.every((id) => ownIds.includes(id))).toBe(true);
    // Second user's own undo proves their stroke survived the first user's undo.
    await second.getByRole("button", { name: "撤回", exact: true }).tap();
    await expect(first.locator("polyline")).toHaveCount(baseline);
    const stickers = await second
      .getByRole("button", { name: "選取 ✿ 貼圖" })
      .count();
    await first.getByRole("button", { name: "加入 ✿ 貼圖" }).tap();
    await expect(
      second.getByRole("button", { name: "選取 ✿ 貼圖" }),
    ).toHaveCount(stickers + 1);
    // Move own sticker; other browser sees the same coordinate.
    const sticker = first.getByRole("button", { name: "選取 ✿ 貼圖" }).last();
    await sticker.focus();
    await sticker.press("ArrowRight");
    const id = await sticker.getAttribute("data-id");
    await expect(second.locator(`[data-id="${id}"] text`)).toHaveAttribute(
      "x",
      "510",
    );
    const png = await first.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      c.getContext("2d")!.fillRect(0, 0, 8, 8);
      return c.toDataURL().split(",")[1];
    });
    const images = await second.locator("svg image").count();
    await first
      .getByLabel("上傳自己的圖片")
      .setInputFiles({
        name: "test.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      });
    await expect(second.locator("svg image")).toHaveCount(images + 1);
    const imageURL = await second
      .locator("svg image")
      .last()
      .getAttribute("href");
    expect((await second.request.get(imageURL!)).ok()).toBe(true);
    await Promise.all([first.reload(), second.reload()]);
    await expect(second.getByRole("button", { name: "燈 1" })).toHaveAttribute(
      "aria-pressed",
      String(initial !== "true"),
    );
    await expect(first.locator("svg image")).toHaveCount(images + 1);
    await expect(
      second.getByRole("button", { name: "選取 ✿ 貼圖" }),
    ).toHaveCount(stickers + 1);
    await expect(second.locator("polyline")).toHaveCount(baseline);
    // Turning a light off/on has no effect on stored artwork.
    await first.getByRole("button", { name: "燈 1" }).tap();
    await expect(second.getByRole("button", { name: "燈 1" })).toHaveAttribute(
      "aria-pressed",
      initial!,
    );
    await expect(second.locator("svg image")).toHaveCount(images + 1);
    expect(
      await first.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // Remove test-created image, movement, and sticker through the same own-operation undo API.
    await first.getByRole("button", { name: "撤回", exact: true }).tap(); // last light toggle
    await first.getByRole("button", { name: "撤回", exact: true }).tap(); // image create
    await expect(second.locator("svg image")).toHaveCount(images);
    await first.getByRole("button", { name: "撤回", exact: true }).tap(); // move
    await first.getByRole("button", { name: "撤回", exact: true }).tap(); // sticker create
    await expect(
      second.getByRole("button", { name: "選取 ✿ 貼圖" }),
    ).toHaveCount(stickers);
    await first.getByRole("button", { name: "撤回", exact: true }).tap(); // initial light toggle
    await expect(second.getByRole("button", { name: "燈 1" })).toHaveAttribute(
      "aria-pressed",
      initial!,
    );
  } finally {
    await a.close();
    await b.close();
  }
});
