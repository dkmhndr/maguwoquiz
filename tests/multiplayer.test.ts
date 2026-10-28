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

it("runs a persisted 19-player game with concurrent answers, excludes previous winners, and completes with one gift each", async () => {
  const host = await app.host();
  const players = await Promise.all(Array.from({ length: 19 }, (_, i) => app.player(i)));
  await host.action("initialize");
  const awarded = new Set<string>();
  const authors = new Set<string>();
  for (let number = 1; number <= 19; number++) {
    expect((await host.action("start")).status).toBe(200);
    const state = (await host.get()).body;
    authors.add(state.round.authorId);
    const author = seedData.findIndex((p) => p.id === state.round.authorId);
    const correct = seedData[author].question.options.find((o) => o.correct)!.id;
    const input = { roundId: state.round.id, optionId: correct };
    const nonAuthors = seedData
      .map((p, i) => ({ ...p, index: i }))
      .filter((p) => p.id !== state.round.authorId);
    const previousWinner = nonAuthors.find((p) => awarded.has(p.id));
    const expectedWinner = nonAuthors.find((p) => !awarded.has(p.id));
    if (previousWinner)
      expect((await players[previousWinner.index].post("answer", input)).status).toBe(200);
    if (expectedWinner)
      expect((await players[expectedWinner.index].post("answer", input)).status).toBe(200);
    const remaining = nonAuthors.filter(
      (p) => p.id !== previousWinner?.id && p.id !== expectedWinner?.id,
    );
    const replies = await Promise.all(remaining.map((p) => players[p.index].post("answer", input)));
    expect(replies.every((reply) => reply.status === 200)).toBe(true);
    const result = (await host.get()).body;
    expect(result.status).toBe("result_revealed");
    expect(result.round.submissionCount).toBe(18);
    expect(result.round.correctOptionId).toBe(correct);
    expect(result.round.winnerId).toBe(expectedWinner?.id ?? null);
    expect(result.round.logs).toHaveLength(18);
    if (expectedWinner) awarded.add(expectedWinner.id);
    expect(result.ledger.length).toBe(awarded.size);
    expect(JSON.stringify(result.ledger)).not.toMatch(/giftName|description/);
    if (previousWinner)
      expect(
        result.round.logs.find(
          (log: { participantId: string }) => log.participantId === previousWinner.id,
        ).eligible,
      ).toBe(false);
    // A fresh request with the same cookie is the refresh/reconnect recovery path.
    expect((await app.request("GET", "state", undefined, players[0].cookie)).body.round.id).toBe(
      state.round.id,
    );
    expect((await host.action("advance")).status).toBe(200);
  }
  expect(authors.size).toBe(19);
  expect((await host.action("gacha")).status).toBe(200);
  const state = (await host.get()).body;
  expect(state.status).toBe("game_complete");
  expect(state.ledger).toHaveLength(19);
  expect(new Set(state.ledger.map((g: { recipientId: string }) => g.recipientId)).size).toBe(19);
  const reconnects = await Promise.all(players.map((player) => player.get()));
  expect(reconnects.every((reply) => reply.body.myGift !== null)).toBe(true);
}, 60000);
