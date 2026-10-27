import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { seedData } from "../src/seed/data";

test("festive homepage fits desktop and phone without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good friends/ })).toBeVisible();
  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/home-mobile.png", fullPage: true });
});

test("invalid invitation gets an honest error and strips its fragment", async ({ page }) => {
  await page.goto("/join#invalid-link");
  await expect(page.getByRole("heading", { name: /Kursimu masih/ })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator('.join-content [role="alert"]')).toBeVisible();
});

test("results open without the host while a phone reconnects and keeps gift contents private", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const links = JSON.parse(
    await readFile(join(process.env.LOCAL_TEST_DATABASE_PATH!, "private-invitations.json"), "utf8"),
  ) as { url: string }[];
  const hostContext = await browser.newContext();
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const player = await playerContext.newPage();
  try {
    await host.goto("/host");
    await host.getByLabel("Kata sandi host").fill("e2e-private-host-password");
    await host.getByRole("button", { name: "Masuk sebagai host" }).click();
    await host.getByRole("button", { name: "Siapkan & acak game" }).click();
    await player.goto(links[0].url);
    await expect(player.getByText(`HEY, ${seedData[0].name.toUpperCase()}`)).toBeVisible();
    await host.getByRole("button", { name: "Mulai ronde pertama" }).click();
    await expect(host.getByRole("button", { name: "Tutup ronde sekarang" })).toBeVisible();
    const state = await (await host.request.get("/api/host/state")).json();
    if (state.round.authorId === "p01") {
      await player.goto(links[1].url);
      await expect(player.getByText(`HEY, ${seedData[1].name.toUpperCase()}`)).toBeVisible();
    }
    const author = seedData.find((person) => person.id === state.round.authorId)!;
    const correctOption = author.question.options.find((option) => option.correct)!;
    await player
      .locator(".answer-option")
      .nth(author.question.options.indexOf(correctOption))
      .click();
    await expect(player.getByText("Jawaban tersimpan", { exact: true })).toBeVisible();
    await expect(player.getByRole("dialog")).not.toBeVisible();
    await player.reload();
    await expect(player.getByText("Jawaban tersimpan", { exact: true })).toBeVisible();
    await expect(player.locator(".answer-option").first()).toBeDisabled();
    await playerContext.setOffline(true);
    await expect(player.getByText("Menghubungkan ulang", { exact: true })).toBeVisible();
    await host.close();
    await expect
      .poll(() => Date.now() >= Date.parse(state.round.deadline), { timeout: 20000 })
      .toBe(true);
    await playerContext.setOffline(false);
    const celebration = player.getByRole("dialog");
    await expect(celebration).toBeVisible({ timeout: 15000 });
    await expect(
      celebration.getByRole("heading", { name: "Jawaban benar, kado untukmu!" }),
    ).toBeVisible();
    await expect(celebration).toContainText(`Kado dari ${author.name}`);
    await expect(celebration.locator(".confetti-layer")).toBeHidden();
    await player.screenshot({ path: "test-results/celebration-mobile.png" });
    await celebration.getByRole("button", { name: "Lanjut bermain" }).click();
    await expect(celebration).not.toBeVisible();
    await expect(player.locator(".winner-reveal")).toBeVisible({ timeout: 15000 });
    await expect(player.locator(".answer-option.correct")).toHaveCount(1);
    await expect(player.getByRole("heading", { name: "Kamu menang!" })).toBeVisible();
    await expect(player.locator(".gift-card")).toContainText(`Kado dari ${author.name}`);
    await player.reload();
    await expect(player.locator(".gift-card")).toContainText(`Kado dari ${author.name}`);
    await expect(player.getByRole("dialog")).not.toBeVisible();
    const resumedHost = await hostContext.newPage();
    await resumedHost.goto("/host");
    await expect(resumedHost.locator(".ledger")).toContainText(`Kado dari ${author.name}`);
    await expect(resumedHost.getByRole("dialog")).not.toBeVisible();
    await expect(resumedHost.getByRole("button", { name: /Reveal/ })).toHaveCount(0);
    for (const person of seedData) {
      await expect(player.locator("body")).not.toContainText(person.gift.name);
      await expect(player.locator("body")).not.toContainText(person.gift.description);
      await expect(resumedHost.locator("body")).not.toContainText(person.gift.name);
    }
    expect(
      await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await player.screenshot({ path: "test-results/player-result-mobile.png", fullPage: true });
    await resumedHost.screenshot({ path: "test-results/host-result-desktop.png", fullPage: true });
    await resumedHost.getByRole("button", { name: "Lanjut ke ronde berikutnya" }).click();
    await expect(resumedHost.getByRole("button", { name: "Mulai ronde berikutnya" })).toBeVisible();
    await expect(player.locator(".lobby-card")).toBeVisible();
    const waiting = await (await player.request.get("/api/state")).json();
    expect(waiting.status).toBe("lobby");
    expect(waiting.roundNumber).toBe(1);
    await resumedHost.getByRole("button", { name: "Mulai ronde berikutnya" }).click();
    await expect(player.locator(".question-card")).toBeVisible();
    await expect
      .poll(async () => (await (await player.request.get("/api/state")).json()).roundNumber)
      .toBe(2);

    const friendContext = await browser.newContext({ viewport: { width: 320, height: 844 } });
    const giftOnlyContext = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const friend = await friendContext.newPage();
      await friend.goto(links[3].url);
      await expect(friend.getByText(`HEY, ${seedData[3].name.toUpperCase()}`)).toBeVisible();
      const giftOnlyPlayer = await giftOnlyContext.newPage();
      await giftOnlyPlayer.goto(links[4].url);
      await expect(
        giftOnlyPlayer.getByText(`HEY, ${seedData[4].name.toUpperCase()}`),
      ).toBeVisible();
      const origin = "http://127.0.0.1:3300";
      const fastestContext = await browser.newContext();
      try {
        const exchange = await fastestContext.request.post("/api/invite", {
          headers: { Origin: origin },
          data: { token: new URL(links[2].url).hash.slice(1) },
        });
        expect(exchange.status()).toBe(200);
        const playerIdentity = (await (await player.request.get("/api/state")).json()).me;
        const hostAction = async (action: string) => {
          const current = await (await resumedHost.request.get("/api/host/state")).json();
          const response = await resumedHost.request.post("/api/host/action", {
            headers: { Origin: origin },
            data: { action, version: current.version },
          });
          expect(response.status()).toBe(200);
        };
        let correctOnlyChecked = false;
        let automaticDismissChecked = false;
        for (let number = 2; number <= 20; number++) {
          const current = await (await resumedHost.request.get("/api/host/state")).json();
          const checkCorrectOnly =
            (!correctOnlyChecked || !automaticDismissChecked) &&
            current.round.authorId !== playerIdentity.id &&
            current.round.authorId !== "p04";
          const checkAutomaticDismiss = checkCorrectOnly && correctOnlyChecked;
          if (checkCorrectOnly) {
            await player.emulateMedia({ reducedMotion: "no-preference" });
            const question = seedData.find(
              (person) => person.id === current.round.authorId,
            )!.question;
            expect(
              (
                await player.request.post("/api/answer", {
                  headers: { Origin: origin },
                  data: {
                    roundId: current.round.id,
                    optionId: question.options.find((option) => option.correct)!.id,
                  },
                })
              ).status(),
            ).toBe(200);
          }
          if (current.round.authorId === playerIdentity.id) {
            const question = seedData.find((person) => person.id === playerIdentity.id)!.question;
            const answer = {
              roundId: current.round.id,
              optionId: question.options.find((option) => option.correct)!.id,
            };
            for (const request of [fastestContext.request, friend.request]) {
              const response = await request.post("/api/answer", {
                headers: { Origin: origin },
                data: answer,
              });
              expect(response.status()).toBe(200);
            }
          }
          await hostAction("close");
          if (checkCorrectOnly) {
            const correctCelebration = player.getByRole("dialog");
            await expect(correctCelebration).toBeVisible({ timeout: 15000 });
            await expect(
              correctCelebration.getByRole("heading", { name: "Jawabanmu benar!" }),
            ).toBeVisible();
            await expect(correctCelebration.locator(".confetti-layer")).toBeVisible();
            await expect(correctCelebration.locator(".confetti-piece")).toHaveCount(56);
            await expect(correctCelebration).not.toContainText("Kado dari");
            await player.screenshot({ path: "test-results/confetti-mobile.png" });
            if (!checkAutomaticDismiss) {
              const nextSync = player.waitForResponse((response) =>
                response.url().endsWith("/api/state"),
              );
              await player.keyboard.press("Escape");
              await nextSync;
              await expect(correctCelebration).not.toBeVisible();
            }
            await player.emulateMedia({ reducedMotion: "reduce" });
            correctOnlyChecked = true;
          }
          await hostAction("advance");
          if (number < 20) await hostAction("start");
          if (checkAutomaticDismiss) {
            await expect(player.getByRole("dialog")).not.toBeVisible({ timeout: 15000 });
            automaticDismissChecked = true;
          }
        }
        expect(correctOnlyChecked).toBe(true);
        expect(automaticDismissChecked).toBe(true);
        await hostAction("gacha");
        const giftCelebration = giftOnlyPlayer.getByRole("dialog");
        await expect(giftCelebration).toBeVisible({ timeout: 15000 });
        await expect(
          giftCelebration.getByRole("heading", { name: "Kamu mendapat kado!" }),
        ).toBeVisible();
        await expect(giftCelebration).toContainText("Kado dari ");
        await giftCelebration.getByRole("button", { name: "Lanjut bermain" }).click();
        await friend
          .getByRole("dialog")
          .getByRole("button", { name: "Lanjut bermain" })
          .click({ timeout: 15000 });
        await expect(player.getByRole("heading", { name: "Ranking jawaban benar" })).toBeVisible({
          timeout: 15000,
        });
        await expect(friend.getByRole("heading", { name: "Ranking jawaban benar" })).toBeVisible({
          timeout: 15000,
        });
        await expect(player.locator(".ranking-list li")).toHaveCount(3);
        await expect(friend.locator(".ranking-list li")).toHaveCount(3);
        await expect(player.locator(".ranking-personal")).toContainText("Peringkat");
        await expect(friend.locator(".ranking-personal")).toContainText("Peringkat");
        await expect(player.getByText("Siapa yang paling kenal kamu?")).toHaveCount(0);
        await player.reload();
        await expect(player.locator(".ranking-personal")).toContainText("Peringkat");
        for (const view of [player, friend]) {
          expect(
            await view.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
        }
        await player.screenshot({
          path: "test-results/personal-result-mobile.png",
          fullPage: true,
        });
        await friend.screenshot({
          path: "test-results/personal-result-empty-mobile.png",
          fullPage: true,
        });
      } finally {
        await fastestContext.close();
      }
    } finally {
      await giftOnlyContext.close();
      await friendContext.close();
    }
  } finally {
    await playerContext.close();
    await hostContext.close();
  }
});
