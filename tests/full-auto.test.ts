import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness } from "./support/harness";
import { seedData } from "../src/seed/data";
import { allocations, rounds } from "../src/db/schema";

describe("full auto: 15-second questions and 10-second intermissions", () => {
  let app: Awaited<ReturnType<typeof createHarness>>;
  beforeEach(async () => {
    app = await createHarness();
  });
  afterEach(async () => {
    await app?.close();
  });

  async function startAuto() {
    const host = await app.host();
    expect((await host.action("auto_on")).status).toBe(200);
    expect((await host.action("initialize")).status).toBe(200);
    expect((await host.action("start")).status).toBe(200);
    return host;
  }

  it("defaults to manual, persists host mode choice, and rejects changes after starting", async () => {
    const host = await app.host();
    const original = (await host.get()).body;
    expect(original.autoMode).toBe(false);
    expect(original.intermissionEndsAt).toBeNull();
    expect((await host.action("auto_on")).status).toBe(200);
    expect((await app.request("GET", "host/state", undefined, host.cookie)).body.autoMode).toBe(
      true,
    );
    expect((await host.action("auto_off", original.version)).body.error.code).toBe("STALE_STATE");
    expect((await host.action("auto_off")).status).toBe(200);
    expect((await host.get()).body.autoMode).toBe(false);
    await host.action("auto_on");
    await host.action("initialize");
    await host.action("start");
    expect((await host.action("auto_off")).body.error.code).toBe("INVALID_TRANSITION");
    expect((await host.action("close")).body.error.code).toBe("INVALID_TRANSITION");
    const state = (await host.get()).body;
    expect(Date.parse(state.round.deadline) - Date.parse(state.round.startedAt)).toBe(15000);
    const player = await app.player(0);
    expect((await player.get()).body.autoMode).toBe(true);
    expect(
      (await player.post("host/action", { action: "auto_off", version: state.version })).status,
    ).toBe(403);
  });

  it("keeps answers hidden for the full 15 seconds even after all 18 friends submit", async () => {
    const host = await startAuto();
    const before = (await host.get()).body;
    const author = seedData.find((p) => p.id === before.round.authorId)!;
    const authorPlayer = await app.player(seedData.indexOf(author));
    const input = {
      roundId: before.round.id,
      optionId: author.question.options.find((o) => o.correct)!.id,
    };
    expect((await authorPlayer.post("answer", input)).body.error.code).toBe("AUTHOR_EXCLUDED");
    let firstPlayer: Awaited<ReturnType<typeof app.player>> | undefined;
    for (let index = 0; index < 19; index++) {
      if (seedData[index].id === author.id) continue;
      const player = await app.player(index);
      firstPlayer ??= player;
      expect((await player.post("answer", input)).status).toBe(200);
    }
    const active = (await firstPlayer!.get()).body;
    expect(active.status).toBe("question_active");
    expect(active.round.submissionCount).toBe(18);
    expect(active.round.correctOptionId).toBeUndefined();
    expect(active.submission.correct).toBeUndefined();
    expect(active.ledger).toHaveLength(0);
    await app.expireRound();
    const result = (await firstPlayer!.get()).body;
    expect(result.status).toBe("result_revealed");
    expect(result.submission.correct).toBe(true);
    expect(result.myGift.ownerId).toBe(author.id);
    expect(result.ledger).toHaveLength(1);
    const [persisted] = await app.db.select().from(rounds);
    expect(Date.parse(result.intermissionEndsAt) - persisted.revealedAt!.getTime()).toBe(10000);
    expect(Date.parse(result.intermissionEndsAt) - Date.parse(result.serverNow)).toBeGreaterThan(
      9000,
    );
    expect((await firstPlayer!.get()).body.round.id).toBe(before.round.id);
    expect((await host.action("advance")).body.error.code).toBe("INVALID_TRANSITION");
  });

  it("starts exactly one fresh round after intermission with no host and rejects stale answers/actions", async () => {
    const host = await startAuto();
    const old = (await host.get()).body;
    const player = await app.player(0);
    await app.expireRound();
    const result = (await player.get()).body;
    expect(result.roundNumber).toBe(1);
    expect(result.intermissionEndsAt).not.toBeNull();
    await app.expireIntermission();
    const responses = await Promise.all([player.get(), player.get(), player.get()]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("question_active");
      expect(response.body.roundNumber).toBe(2);
      expect(response.body.round.id).toBe(responses[0].body.round.id);
      expect(response.body.intermissionEndsAt).toBeNull();
      expect(
        Date.parse(response.body.round.deadline) - Date.parse(response.body.round.startedAt),
      ).toBe(15000);
      expect(response.body.submission).toBeNull();
    }
    expect(await app.db.select().from(rounds)).toHaveLength(2);
    const author = seedData.find((p) => p.id === old.round.authorId)!;
    expect(
      (
        await player.post("answer", {
          roundId: old.round.id,
          optionId: author.question.options[0].id,
        })
      ).body.error.code,
    ).toBe("STALE_ROUND");
    expect((await host.action("close", old.version)).body.error.code).toBe("STALE_STATE");
    expect((await player.get()).body.roundNumber).toBe(2);
  });

  it("gives a full intermission after delayed reconciliation instead of skipping unseen questions", async () => {
    await startAuto();
    const player = await app.player(0);
    await app.expireRound();
    const result = (await player.get()).body;
    expect(result.status).toBe("result_revealed");
    expect(Date.parse(result.intermissionEndsAt) - Date.parse(result.serverNow)).toBeGreaterThan(
      9000,
    );
    await app.expireIntermission();
    const next = (await player.get()).body;
    expect(next.roundNumber).toBe(2);
    expect(Date.parse(next.round.deadline) - Date.parse(next.serverNow)).toBeGreaterThan(14000);
  });

  it("runs all 19 rounds and final gacha automatically, with private gifts and ranking", async () => {
    await startAuto();
    const player = await app.player(0);
    const seen = new Set<string>();
    for (let number = 1; number <= 19; number++) {
      const active = (await player.get()).body;
      expect(active.status).toBe("question_active");
      expect(active.roundNumber).toBe(number);
      expect(seen.has(active.round.id)).toBe(false);
      seen.add(active.round.id);
      await app.expireRound();
      const result = (await player.get()).body;
      expect(result.status).toBe("result_revealed");
      expect(result.roundNumber).toBe(number);
      expect(result.ranking).toBeNull();
      expect(result.intermissionEndsAt).not.toBeNull();
      await app.expireIntermission();
    }
    const replies = await Promise.all([player.get(), player.get(), player.get()]);
    for (const { body } of replies) {
      expect(body.status).toBe("game_complete");
      expect(body.roundNumber).toBe(19);
      expect(body.intermissionEndsAt).toBeNull();
      expect(body.ranking).toHaveLength(19);
      expect(
        body.ranking.every(
          (entry: { rank: number; correctCount: number }) =>
            entry.rank === 1 && entry.correctCount === 0,
        ),
      ).toBe(true);
      expect(body.myGift.source).toBe("gacha");
      expect(body.ledger).toHaveLength(19);
      expect(new Set(body.ledger.map((a: { recipientId: string }) => a.recipientId)).size).toBe(19);
      expect(new Set(body.ledger.map((a: { giftId: string }) => a.giftId)).size).toBe(19);
      expect(body.ledger).toEqual(replies[0].body.ledger);
      expect(JSON.stringify(body)).not.toMatch(/giftName|description/);
    }
    expect(await app.db.select().from(rounds)).toHaveLength(19);
    expect(await app.db.select().from(allocations)).toHaveLength(19);
    const host = await app.host();
    expect((await host.get()).body.ranking).toEqual(replies[0].body.ranking);
    expect((await host.action("gacha")).status).toBe(200);
    expect((await player.get()).body.ledger).toEqual(replies[0].body.ledger);
  });

  it("rolls back automatic final gacha on integrity errors without losing the last result", async () => {
    await startAuto();
    const player = await app.player(0);
    for (let number = 1; number <= 19; number++) {
      await app.expireRound();
      expect((await player.get()).body.status).toBe("result_revealed");
      if (number < 19) {
        await app.expireIntermission();
        expect((await player.get()).body.status).toBe("question_active");
      }
    }
    await app.removeUnallocatedGift(seedData[0].gift.id);
    await app.expireIntermission();
    expect((await player.get()).body.error.code).toBe("GACHA_INTEGRITY");
    expect(await app.db.select().from(allocations)).toHaveLength(0);
    const { games } = await import("../src/db/schema");
    expect((await app.db.select().from(games))[0].status).toBe("result_revealed");
  });
});
