import { afterAll, beforeAll, expect, it } from "vitest";
import { createHarness } from "./support/harness";
import { seedData } from "../src/seed/data";

let app: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  app = await createHarness();
});
afterAll(async () => {
  await app?.close();
});

it("plays 19 no-winner rounds and atomically assigns every gift exactly once with idempotent gacha", async () => {
  const host = await app.host();
  const players = await Promise.all(Array.from({ length: 19 }, (_, i) => app.player(i)));
  expect((await host.action("gacha")).status).toBe(409);
  await host.action("initialize");
  const authors = new Set<string>();
  for (let index = 0; index < 19; index++) {
    expect((await host.action("start")).status).toBe(200);
    const round = (await host.get()).body.round;
    authors.add(round.authorId);
    expect((await host.action("close")).status).toBe(200);
    expect((await host.get()).body.round.winnerId).toBeNull();
    expect((await host.action("advance")).status).toBe(200);
  }
  expect(authors.size).toBe(19);
  expect((await host.get()).body.status).toBe("final_gacha");
  const version = (await host.get()).body.version;
  const replies = await Promise.all([host.action("gacha", version), host.action("gacha", version)]);
  expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
  const complete = (await host.get()).body;
  expect(complete.status).toBe("game_complete");
  expect(complete.ledger).toHaveLength(19);
  expect(
    new Set(complete.ledger.map((award: { recipientId: string }) => award.recipientId)).size,
  ).toBe(19);
  expect(new Set(complete.ledger.map((award: { giftId: string }) => award.giftId)).size).toBe(19);
  expect(JSON.stringify(complete)).not.toMatch(/giftName|description/);
  for (const player of players) {
    const state = (await player.get()).body;
    expect(state.myGift).not.toBeNull();
    expect(seedData.some((person) => person.name === state.myGift.ownerName)).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/giftName|description/);
  }
  expect((await host.action("gacha", version)).status).toBe(200);
  expect((await host.get()).body.ledger).toEqual(complete.ledger);
});
