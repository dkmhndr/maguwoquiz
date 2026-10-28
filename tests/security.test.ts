import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "./support/harness";
import { generateInvitations } from "../src/server/auth";
import { seedDatabase } from "../src/db/seed";
import { seedData } from "../src/seed/data";

describe("session and mutation security", () => {
  let app: Awaited<ReturnType<typeof createHarness>>;
  beforeAll(async () => {
    app = await createHarness();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("produces 19 distinct fragment invitations and rejects guessed, malformed, and unknown links", async () => {
    expect(app.links).toHaveLength(19);
    expect(new Set(app.links.map((link) => link.url)).size).toBe(19);
    expect(app.links.every((link) => new URL(link.url).hash.length === 44)).toBe(true);
    expect((await app.request("POST", "invite", { token: "a".repeat(43) })).status).toBe(401);
    expect((await app.request("POST", "invite", { token: "guess" })).status).toBe(400);
  });
  it("keeps participant identity isolated, never exposing tokens or keys", async () => {
    const a = await app.player(0),
      b = await app.player(1);
    expect((await a.get()).body.me.id).toBe("p01");
    expect((await b.get()).body.me.id).toBe("p02");
    expect(
      (await app.request("GET", "state?participantId=p02", undefined, a.cookie)).body.me.id,
    ).toBe("p01");
    const payload = JSON.stringify((await a.get()).body);
    expect(payload).not.toMatch(/tokenHash|hostVersion|isCorrect|correctOptionId/);
    expect(payload).not.toContain(new URL(app.links[0].url).hash.slice(1));
  });
  it("sets secure HttpOnly same-site cookies and validates host credentials on the server", async () => {
    const response = await app.request("POST", "host/login", {
      password: "a-private-host-password",
    });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect((await app.request("POST", "host/login", { password: "not-the-password" })).status).toBe(
      401,
    );
    expect(
      (await app.request("POST", "host/action", { action: "initialize", version: 0 })).status,
    ).toBe(403);
  });
  it("rejects cross-origin writes and extra client-supplied identity fields", async () => {
    const player = await app.player(0);
    expect(
      (
        await app.request(
          "POST",
          "invite",
          { token: new URL(app.links[0].url).hash.slice(1) },
          undefined,
          "https://attacker.test",
        )
      ).status,
    ).toBe(403);
    expect(
      (await player.post("answer", { roundId: "r", optionId: "o", participantId: "p02" })).status,
    ).toBe(400);
  });
  it("expires sessions even when their cookies remain present", async () => {
    const player = await app.player(2);
    await app.expireSession(player.cookie);
    expect((await player.get()).status).toBe(401);
  });
  it("reruns the matching seed without resetting initialized game state and rejects content drift", async () => {
    const host = await app.host();
    await host.action("initialize");
    await host.action("start");
    const before = (await host.get()).body;
    await seedDatabase(app.db);
    expect((await host.get()).body.round.id).toBe(before.round.id);
    const changed = structuredClone(seedData);
    changed[0].name = "Different name";
    await expect(seedDatabase(app.db, changed)).rejects.toThrow("Refusing to overwrite");
    expect((await (await app.player(0)).get()).body.me.name).toBe(seedData[0].name);
  });
  it("requires explicit rotation and revokes both previous links and their sessions", async () => {
    const player = await app.player(0);
    await expect(generateInvitations(app.db, "http://quiz.test")).rejects.toThrow(
      "Links already exist",
    );
    const links = await generateInvitations(app.db, "http://quiz.test", true);
    expect((await player.get()).status).toBe(401);
    expect(
      (await app.request("POST", "invite", { token: new URL(app.links[0].url).hash.slice(1) }))
        .status,
    ).toBe(401);
    expect(
      (await app.request("POST", "invite", { token: new URL(links[0].url).hash.slice(1) })).status,
    ).toBe(200);
  });
  it("limits host password guesses across requests using a persisted limiter", async () => {
    const replies = [];
    for (let i = 0; i < 12; i++)
      replies.push(await app.request("POST", "host/login", { password: "incorrect-password" }));
    expect(replies.some((r) => r.status === 429)).toBe(true);
    expect(replies.at(-1)!.headers.get("retry-after")).toBe("60");
  });
});
