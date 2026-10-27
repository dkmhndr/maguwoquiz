import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./support/harness";
import { seedData } from "../src/seed/data";

describe("private event over HTTP", () => {
  let app: Awaited<ReturnType<typeof createHarness>>;
  beforeAll(async () => {
    app = await createHarness();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("allows invited identities into a persistent lobby but keeps host access separate", async () => {
    const player = await app.player(0);
    const state = await player.get();
    expect(state.status).toBe(200);
    expect(state.body.me.name).toBe(seedData[0].name);
    expect(state.body.participants).toHaveLength(20);
    expect((await player.post("host/action", { action: "initialize", version: 0 })).status).toBe(
      403,
    );
    expect((await app.request("GET", "state")).status).toBe(401);
  });

  it("persists one shuffled order, starts one authoritative 15-second round, and hides its key", async () => {
    const host = await app.host();
    expect((await host.action("initialize")).status).toBe(200);
    expect((await host.action("start")).status).toBe(200);
    const state = (await host.get()).body;
    expect(state.status).toBe("question_active");
    expect(state.round.options).toHaveLength(4);
    expect(Date.parse(state.round.deadline) - Date.parse(state.round.startedAt)).toBe(15000);
    expect(JSON.stringify(state)).not.toMatch(/isCorrect|correctOptionId|tokenHash|questionOrder/);
    expect(
      (await app.request("GET", "host/history", undefined, host.cookie)).body.rounds,
    ).toHaveLength(0);
    expect((await host.action("initialize")).status).toBe(409);
    expect((await host.get()).body.round.id).toBe(state.round.id);
  });

  it("accepts one immutable non-author answer and publishes its result when the host closes early", async () => {
    const host = await app.host();
    const state = (await host.get()).body;
    const author = seedData.findIndex((p) => p.id === state.round.authorId);
    const winnerIndex = author === 0 ? 1 : 0;
    const player = await app.player(winnerIndex);
    const correct = seedData[author].question.options.find((o) => o.correct)!.id;
    const body = { roundId: state.round.id, optionId: correct };
    expect((await (await app.player(author)).post("answer", body)).body.error.code).toBe(
      "AUTHOR_EXCLUDED",
    );
    expect((await player.post("answer", body)).body).toEqual({ ok: true });
    expect((await player.post("answer", body)).body.error.code).toBe("DUPLICATE_SUBMISSION");
    expect((await player.get()).body.submission.optionId).toBe(correct);
    expect(JSON.stringify((await player.get()).body)).not.toMatch(
      /correctOptionId|"correct":|winnerId/,
    );
    expect((await player.get()).body.myGift).toBeNull();
    expect((await host.action("close")).status).toBe(200);
    expect((await player.get()).body.status).toBe("result_revealed");
    expect((await player.get()).body.myGift.recipientId).toBe(seedData[winnerIndex].id);
    expect((await host.get()).body.round.logs[0].correct).toBe(true);
    const result = (await host.get()).body;
    expect((await host.action("close", result.version)).status).toBe(409);
    expect((await host.get()).body.ledger).toEqual(result.ledger);
    expect((await host.action("advance")).status).toBe(200);
  });

  it("lets only the host inspect archived revealed answer logs after advancing", async () => {
    const host = await app.host();
    const history = await app.request("GET", "host/history", undefined, host.cookie);
    expect(history.status).toBe(200);
    expect(history.body.rounds).toHaveLength(1);
    expect(history.body.rounds[0].logs).toHaveLength(1);
    expect(history.body.rounds[0].logs[0].correct).toBe(true);
    expect((await (await app.player(0)).post("host/history", {})).status).toBe(403);
  });
});
