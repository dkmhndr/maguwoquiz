import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./support/harness";
import { seedData } from "../src/seed/data";

describe("round ordering and deadline enforcement", () => {
  let app: Awaited<ReturnType<typeof createHarness>>;
  let host: Awaited<ReturnType<Awaited<ReturnType<typeof createHarness>>["host"]>>;
  beforeAll(async () => {
    app = await createHarness();
    host = await app.host();
    await host.action("initialize");
  });
  afterAll(async () => {
    await app?.close();
  });
  const finish = async () => {
    await host.action("advance");
  };

  it("rejects invalid transitions and concurrent duplicate starts without creating another round", async () => {
    expect((await host.action("advance")).status).toBe(409);
    expect((await host.action("reveal")).status).toBe(400);
    const version = (await host.get()).body.version;
    const responses = await Promise.all([
      host.action("start", version),
      host.action("start", version),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await host.get()).body.roundNumber).toBe(1);
    expect((await host.action("advance")).status).toBe(409);
    await host.action("close");
    await finish();
  });
  it("rejects foreign options and forged identity or timestamps; concurrent double submits accept only one", async () => {
    await host.action("start");
    const round = (await host.get()).body.round;
    const playerIndex = round.authorId === "p01" ? 1 : 0;
    const player = await app.player(playerIndex);
    const foreign = seedData.find((p) => p.id !== round.authorId)!.question.options[0].id;
    expect(
      (await player.post("answer", { roundId: round.id, optionId: foreign })).body.error.code,
    ).toBe("INVALID_OPTION");
    expect(
      (
        await player.post("answer", {
          roundId: round.id,
          optionId: round.options[0].id,
          receivedAt: "2000-01-01",
        })
      ).status,
    ).toBe(400);
    expect(
      (await player.post("answer", { roundId: "other-round", optionId: round.options[0].id })).body
        .error.code,
    ).toBe("STALE_ROUND");
    const input = { roundId: round.id, optionId: round.options[0].id };
    const responses = await Promise.all([
      player.post("answer", input),
      player.post("answer", input),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await host.get()).body.round.submissionCount).toBe(1);
    await host.action("close");
    await finish();
  });
  it("breaks identical database timestamps by submission sequence, not participant ID", async () => {
    await host.action("start");
    const round = (await host.get()).body.round;
    const author = seedData.find((p) => p.id === round.authorId)!;
    const available = (await host.get()).body.participants.filter(
      (p: { id: string; hasGift: boolean }) => p.id !== author.id && !p.hasGift,
    );
    const firstIndex = seedData.findIndex((p) => p.id === available.at(-1).id);
    const secondIndex = seedData.findIndex((p) => p.id === available[0].id);
    const input = {
      roundId: round.id,
      optionId: author.question.options.find((o) => o.correct)!.id,
    };
    await (await app.player(firstIndex)).post("answer", input);
    await (await app.player(secondIndex)).post("answer", input);
    await app.tieTimes();
    await host.action("close");
    expect((await host.get()).body.round.winnerId).toBe(seedData[firstIndex].id);
    await host.action("advance");
  });
  it("rejects late answers and closes an expired round even without the host connected", async () => {
    await host.action("start");
    const round = (await host.get()).body.round;
    const player = await app.player(round.authorId === "p01" ? 1 : 0);
    await app.expireRound();
    expect(
      (await player.post("answer", { roundId: round.id, optionId: round.options[0].id })).body.error
        .code,
    ).toBe("ROUND_CLOSED");
    expect((await player.get()).body.status).toBe("result_revealed");
    expect((await player.get()).body.round.submissionCount).toBe(0);
    expect((await player.get()).body.round.correctOptionId).toBeDefined();
    expect((await player.get()).body.round.winnerId).toBeNull();
    await finish();
  });
  it("reconciles a deadline on a participant GET and never trusts a browser countdown", async () => {
    await host.action("start");
    const player = await app.player(0);
    await app.expireRound();
    expect((await player.get()).body.status).toBe("result_revealed");
    expect((await player.get()).body.round.winnerId).toBeNull();
    await host.action("advance");
  });
});
