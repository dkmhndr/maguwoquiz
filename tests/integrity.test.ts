import { afterAll, beforeAll, expect, it } from "vitest";
import { createHarness } from "./support/harness";

let app: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  app = await createHarness();
});
afterAll(async () => {
  await app?.close();
});

it("blocks mismatched final gift counts without allocating anything and keeps the error host-only", async () => {
  const host = await app.host(),
    player = await app.player(0);
  await host.action("initialize");
  for (let i = 0; i < 19; i++) {
    await host.action("start");
    await host.action("close");
    await host.action("advance");
  }
  await app.removeUnallocatedGift("g20");
  const response = await host.action("gacha");
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe("GACHA_INTEGRITY");
  expect((await host.get()).body.status).toBe("final_gacha");
  expect((await host.get()).body.ledger).toHaveLength(0);
  const state = await player.get();
  expect(state.status).toBe(200);
  expect(state.body).not.toHaveProperty("error");
  expect(state.body.myGift).toBeNull();
});
