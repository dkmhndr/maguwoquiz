import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./support/harness";
import { seedData } from "../src/seed/data";

describe("private gifts and host-cued rounds", () => {
  let app: Awaited<ReturnType<typeof createHarness>>;
  beforeAll(async () => {
    app = await createHarness();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("shows the giver but never gift contents in participant or host responses", async () => {
    const host = await app.host();
    await host.action("initialize");
    await host.action("start");
    const round = (await host.get()).body.round;
    const author = seedData.find((person) => person.id === round.authorId)!;
    const playerIndex = round.authorId === "p01" ? 1 : 0;
    const player = await app.player(playerIndex);
    await player.post("answer", {
      roundId: round.id,
      optionId: author.question.options.find((option) => option.correct)!.id,
    });
    await host.action("close");
    const state = (await player.get()).body;
    expect(state.myGift).toEqual({
      giftId: author.gift.id,
      ownerId: author.id,
      ownerName: author.name,
      recipientId: seedData[playerIndex].id,
      recipientName: seedData[playerIndex].name,
      source: "round",
    });
    const responses = [
      state,
      (await host.get()).body,
      (await app.request("GET", "host/history", undefined, host.cookie)).body,
    ];
    for (const response of responses) {
      const payload = JSON.stringify(response);
      expect(payload).not.toMatch(/giftName|description/);
      for (const person of seedData) {
        expect(payload).not.toContain(person.gift.name);
        expect(payload).not.toContain(person.gift.description);
      }
    }
    await host.action("advance");
  });

  it("publishes results on deadline without a host request and waits for the next host cue", async () => {
    const host = await app.host();
    expect((await host.action("start")).status).toBe(200);
    const before = (await host.get()).body;
    const round = before.round;
    const author = seedData.find((person) => person.id === round.authorId)!;
    const candidate = before.participants.find(
      (person: { id: string; hasGift: boolean }) => person.id !== author.id && !person.hasGift,
    );
    const playerIndex = seedData.findIndex((person) => person.id === candidate.id);
    const player = await app.player(playerIndex);
    const input = {
      roundId: round.id,
      optionId: author.question.options.find((option) => option.correct)!.id,
    };
    expect((await player.post("answer", input)).status).toBe(200);
    const active = (await player.get()).body;
    expect(active.status).toBe("question_active");
    expect(active.round.correctOptionId).toBeUndefined();
    expect(active.submission.correct).toBeUndefined();
    expect(active.ledger).toHaveLength(1);
    await app.expireRound();
    const result = (await player.get()).body;
    expect(result.status).toBe("result_revealed");
    expect(result.round.closed).toBe(true);
    expect(result.round.revealed).toBe(true);
    expect(result.round.correctOptionId).toBe(input.optionId);
    expect(result.round.winnerId).toBe(candidate.id);
    expect(result.myGift.ownerName).toBe(author.name);
    expect(result.ledger).toHaveLength(2);
    expect(result.submission.correct).toBe(true);
    const observer = await app.player(round.authorId === "p20" ? 17 : 18);
    expect((await observer.post("answer", input)).body.error.code).toBe("ROUND_CLOSED");
    const reconnect = (await app.request("GET", "state", undefined, player.cookie)).body;
    expect(reconnect.status).toBe("result_revealed");
    expect(reconnect.round.id).toBe(round.id);
    expect(reconnect.ledger).toEqual(result.ledger);
    expect((await host.action("advance")).status).toBe(200);
    const waiting = (await player.get()).body;
    expect(waiting.status).toBe("lobby");
    expect(waiting.roundNumber).toBe(2);
    expect((await player.get()).body.status).toBe("lobby");
  });

  it("recovers an old closed round automatically without awarding its gift twice", async () => {
    const host = await app.host();
    await host.action("start");
    const before = (await host.get()).body;
    const author = seedData.find((person) => person.id === before.round.authorId)!;
    const candidate = before.participants.find(
      (person: { id: string; hasGift: boolean }) => person.id !== author.id && !person.hasGift,
    );
    const player = await app.player(seedData.findIndex((person) => person.id === candidate.id));
    await player.post("answer", {
      roundId: before.round.id,
      optionId: author.question.options.find((option) => option.correct)!.id,
    });
    await host.action("close");
    const published = (await host.get()).body;
    await app.restoreUnrevealedRound(before.round.id);
    const replies = await Promise.all([player.get(), player.get(), host.get()]);
    for (const reply of replies) {
      expect(reply.status).toBe(200);
      expect(reply.body.status).toBe("result_revealed");
      expect(reply.body.round.revealed).toBe(true);
      expect(reply.body.round.winnerId).toBe(candidate.id);
      expect(reply.body.ledger).toEqual(published.ledger);
      expect(reply.body.version).toBe(published.version + 1);
    }
    expect((await player.get()).body.myGift.ownerName).toBe(author.name);
    expect((await host.action("advance", published.version)).body.error.code).toBe("STALE_STATE");
    expect((await host.action("advance")).status).toBe(200);
  });
});
