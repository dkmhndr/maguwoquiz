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

it("ranks all 19 players by correct answers after completion, independent of gifts and response time", async () => {
  const host = await app.host();
  const players = await Promise.all(seedData.map((_, index) => app.player(index)));
  const scores = new Map(seedData.map((person) => [person.id, 0]));
  let previousWinnerAnswered = false;
  expect((await players[0].get()).body.ranking).toBeNull();
  await host.action("initialize");
  for (let number = 1; number <= 19; number++) {
    expect((await host.action("start")).status).toBe(200);
    const state = (await host.get()).body;
    const author = seedData.find((person) => person.id === state.round.authorId)!;
    const candidates = seedData.filter((person) => person.id !== author.id);
    const correct = author.question.options.find((option) => option.correct)!.id;
    const wrong = author.question.options.find((option) => !option.correct)!.id;
    if (number >= 3) {
      for (const person of [candidates.at(-1)!, candidates[0]]) {
        expect(
          (
            await players[seedData.indexOf(person)].post("answer", {
              roundId: state.round.id,
              optionId: correct,
            })
          ).status,
        ).toBe(200);
        scores.set(person.id, scores.get(person.id)! + 1);
        if (state.participants.find((p: { id: string }) => p.id === person.id).hasGift)
          previousWinnerAnswered = true;
      }
    }
    if (number >= 2) {
      const person = candidates[1];
      expect(
        (
          await players[seedData.indexOf(person)].post("answer", {
            roundId: state.round.id,
            optionId: wrong,
          })
        ).status,
      ).toBe(200);
    }
    expect((await players[0].get()).body.ranking).toBeNull();
    expect((await host.action("close")).status).toBe(200);
    expect((await host.get()).body.ranking).toBeNull();
    expect((await host.action("advance")).status).toBe(200);
  }
  expect(previousWinnerAnswered).toBe(true);
  expect((await players[0].get()).body.ranking).toBeNull();
  expect((await host.action("gacha")).status).toBe(200);
  await app.tieTimes();
  const ranking = (await host.get()).body.ranking;
  expect(ranking).toHaveLength(19);
  const sorted = [...scores.values()].sort((a, b) => b - a);
  expect(new Set(sorted).size).toBeGreaterThan(1);
  expect(sorted.filter((count) => count === 0).length).toBeGreaterThan(1);
  for (const [index, entry] of ranking.entries()) {
    expect(entry.correctCount).toBe(scores.get(entry.participantId));
    expect(entry.participantName).toBe(
      seedData.find((person) => person.id === entry.participantId)!.name,
    );
    expect(entry.correctCount).toBe(sorted[index]);
    expect(entry.rank).toBe(sorted.indexOf(entry.correctCount) + 1);
  }
  for (const player of [players[0], players[1], players[18]]) {
    const state = (await player.get()).body;
    expect(state.ranking).toEqual(ranking);
    expect(state.myQuizResult).toBeUndefined();
    const reconnect = await app.request(
      "GET",
      "state?participantId=other",
      undefined,
      player.cookie,
    );
    expect(reconnect.body.ranking).toEqual(ranking);
  }
  expect(JSON.stringify(ranking)).not.toMatch(
    /giftName|description|optionId|correctOptionId|tokenHash|responseMs/,
  );
}, 60000);
