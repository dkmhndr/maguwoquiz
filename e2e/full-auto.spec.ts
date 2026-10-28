import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { seedData } from "../src/seed/data";

test("full auto survives host disconnect, shows a 10-second intermission, and clears celebrations at the next question", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const links = JSON.parse(
    await readFile(join(process.env.LOCAL_TEST_DATABASE_PATH!, "private-invitations.json"), "utf8"),
  ) as { url: string }[];
  const hostContext = await browser.newContext();
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const wrongContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const player = await playerContext.newPage();
  const wrongPlayer = await wrongContext.newPage();
  try {
    await host.goto("/host");
    await host.getByLabel("Kata sandi host").fill("e2e-private-host-password");
    await host.getByRole("button", { name: "Masuk sebagai host" }).click();
    const mode = host.getByRole("checkbox", { name: "Full Auto" });
    await expect(mode).not.toBeChecked();
    await mode.click();
    await expect(mode).toBeChecked();
    await host.reload();
    await expect(host.getByRole("checkbox", { name: "Full Auto" })).toBeChecked();
    await host.getByRole("button", { name: "Siapkan & acak game" }).click();
    await player.goto(links[0].url);
    await expect(player.getByText("10 detik jeda", { exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Mulai ronde pertama" }).click();
    await expect(host.locator(".question-card")).toBeVisible();
    await expect(host.getByRole("button", { name: "Tutup ronde sekarang" })).toHaveCount(0);
    const initial = await (await host.request.get("/api/host/state")).json();
    if (initial.round.authorId === "p01") await player.goto(links[1].url);
    const author = seedData.find((p) => p.id === initial.round.authorId)!;
    const correct = author.question.options.findIndex((o) => o.correct);
    const wrongPlayerIndex = initial.round.authorId === seedData[2].id ? 3 : 2;
    await wrongPlayer.goto(links[wrongPlayerIndex].url);
    await expect(player.locator(".question-card")).toBeVisible();
    await expect(player.locator(".author-chip strong")).toHaveText(author.name);
    await wrongPlayer
      .locator(".answer-option")
      .nth((correct + 1) % author.question.options.length)
      .click();
    await player.locator(".answer-option").nth(correct).click();
    await expect(player.getByText("Jawaban tersimpan", { exact: true })).toBeVisible();
    await expect(player.getByRole("dialog")).not.toBeVisible();
    await host.close();
    await expect(player.getByRole("dialog")).toBeVisible({ timeout: 20000 });
    await expect(player.getByRole("dialog")).toContainText("Ciee dapet kado!");
    await expect(wrongPlayer.getByRole("dialog")).toContainText("Yah, jawabanmu belum tepat.");
    await expect(wrongPlayer.locator(".confetti-layer")).toHaveCount(0);
    await wrongPlayer.getByRole("button", { name: "Lanjut bermain" }).click();
    await wrongPlayer.reload();
    await expect(wrongPlayer.getByRole("dialog")).not.toBeVisible();
    await expect(player.locator(".intermission-card")).toContainText("FULL AUTO / JEDA HASIL");
    const result = await (await player.request.get("/api/state")).json();
    expect(result.status).toBe("result_revealed");
    expect(result.roundNumber).toBe(1);
    expect(Date.parse(result.intermissionEndsAt) - Date.parse(result.serverNow)).toBeGreaterThan(
      5000,
    );
    expect(
      Date.parse(result.intermissionEndsAt) - Date.parse(result.serverNow),
    ).toBeLessThanOrEqual(10000);
    await player.screenshot({ path: "test-results/full-auto-celebration-mobile.png" });
    // Leave the popup open: the next server-started question must dismiss it itself.
    await expect(player.locator(".intermission-card")).not.toBeVisible({ timeout: 15000 });
    await expect(player.getByRole("dialog")).not.toBeVisible();
    const next = await (await player.request.get("/api/state")).json();
    expect(next.status).toBe("question_active");
    expect(next.roundNumber).toBe(2);
    expect(next.round.id).not.toBe(initial.round.id);
    expect(next.intermissionEndsAt).toBeNull();
    expect(next.myGift).toEqual(result.myGift);
    expect(Date.parse(next.round.deadline) - Date.parse(next.round.startedAt)).toBe(15000);
    await player.reload();
    await expect(player.getByRole("dialog")).not.toBeVisible();
    const resumedHost = await hostContext.newPage();
    await resumedHost.goto("/host");
    await expect(resumedHost.locator(".host-controls")).toContainText("FULL AUTO");
    await expect(resumedHost.getByRole("checkbox", { name: "Full Auto" })).toHaveCount(0);
    await expect(
      resumedHost.getByRole("button", { name: /Mulai ronde|Tutup ronde|Lanjut ke/ }),
    ).toHaveCount(0);
    await expect(player.locator(".question-card")).toBeVisible();
    for (const width of [390, 320]) {
      await player.setViewportSize({ width, height: 844 });
      const overflow = await player.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        elements: Array.from(document.querySelectorAll("body *"))
          .map((el) => ({
            name: `${el.tagName.toLowerCase()}${el instanceof HTMLElement ? `.${el.className.toString().replaceAll(" ", ".")}` : ""}`,
            left: Math.round(el.getBoundingClientRect().left),
            right: Math.round(el.getBoundingClientRect().right),
            width: el.scrollWidth,
          }))
          .filter(
            (el) => el.right > window.innerWidth || el.left < 0 || el.width > window.innerWidth,
          )
          .slice(0, 8),
      }));
      expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    }
    await player.screenshot({
      path: "test-results/full-auto-next-round-mobile.png",
      fullPage: true,
    });
  } finally {
    await wrongContext.close();
    await playerContext.close();
    await hostContext.close();
  }
});
