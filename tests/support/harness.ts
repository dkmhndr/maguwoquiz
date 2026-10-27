import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile, readdir } from "node:fs/promises";
import { connect, type Database } from "../../src/db/connection";
import * as schema from "../../src/db/schema";
import { seedDatabase } from "../../src/db/seed";
import { generateInvitations } from "../../src/server/auth";
import { hashPassword, hashToken } from "../../src/server/crypto";
import { createHandler } from "../../src/server/http";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

export async function createHarness() {
  // Optional real PostgreSQL tests use a fresh private schema, never reset existing tables.
  const namespace = `bq_test_${randomUUID().replaceAll("-", "")}`;
  const admin = process.env.TEST_DATABASE_URL ? connect(process.env.TEST_DATABASE_URL) : null;
  if (admin) await admin.db.execute(sql.raw(`CREATE SCHEMA "${namespace}"`));
  const pg = process.env.TEST_DATABASE_URL ? null : new PGlite();
  const connection = pg
    ? { db: drizzle(pg, { schema }) as Database, close: () => pg.close() }
    : connect(process.env.TEST_DATABASE_URL, namespace);
  const { db } = connection;
  for (const file of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    const migration = await readFile(`drizzle/${file}`, "utf8");
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim()) await db.execute(statement);
  }
  await seedDatabase(db);
  const links = await generateInvitations(db, "http://quiz.test");
  const config = {
    hostPasswordHash: hashPassword("a-private-host-password"),
    secureCookies: true,
    appUrl: "http://quiz.test",
  };
  const handler = createHandler(db, config);
  const request = async (
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
    origin = "http://quiz.test",
  ) => {
    const response = await handler(
      new Request(`http://quiz.test/api/${path}`, {
        method,
        headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      headers: response.headers,
    };
  };
  const client = (cookie: string, host = false) => ({
    cookie,
    get: () => request("GET", host ? "host/state" : "state", undefined, cookie),
    post: (path: string, body: unknown) => request("POST", path, body, cookie),
    action: async (action: string, version?: number) =>
      request(
        "POST",
        "host/action",
        {
          action,
          version: version ?? (await request("GET", "host/state", undefined, cookie)).body.version,
        },
        cookie,
      ),
  });
  return {
    db,
    links,
    request,
    handler,
    config,
    player: async (index: number) => {
      const response = await request("POST", "invite", {
        token: new URL(links[index].url).hash.slice(1),
      });
      if (response.status !== 200 || !response.cookie)
        throw new Error(`Invitation exchange failed: ${JSON.stringify(response.body)}`);
      return client(response.cookie);
    },
    host: async () => {
      const response = await request("POST", "host/login", { password: "a-private-host-password" });
      if (response.status !== 200 || !response.cookie) throw new Error("Host login failed");
      return client(response.cookie, true);
    },
    // Time and integrity fixtures simulate external clock/data conditions, not game decisions.
    expireRound: () =>
      db
        .update(schema.rounds)
        .set({
          startedAt: sql`clock_timestamp() - interval '20 seconds'`,
          deadline: sql`clock_timestamp() - interval '1 second'`,
        })
        .where(sql`${schema.rounds.closedAt} is null`),
    expireSession: (cookie: string) =>
      db
        .update(schema.sessions)
        .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` })
        .where(eq(schema.sessions.tokenHash, hashToken(cookie.split("=")[1]))),
    expireIntermission: () =>
      db
        .update(schema.rounds)
        .set({ revealedAt: sql`clock_timestamp() - interval '11 seconds'` })
        .where(sql`${schema.rounds.revealedAt} is not null`),
    tieTimes: () =>
      db
        .update(schema.submissions)
        .set({ receivedAt: sql`date_trunc('second', clock_timestamp())` }),
    // Simulate persisted closure from the old manual-reveal deployment.
    restoreUnrevealedRound: (roundId: string) =>
      db.transaction(async (tx) => {
        await tx
          .update(schema.rounds)
          .set({ revealedAt: null })
          .where(eq(schema.rounds.id, roundId));
        await tx
          .update(schema.games)
          .set({ status: "round_closed" })
          .where(eq(schema.games.id, "main"));
      }),
    removeUnallocatedGift: (giftId: string) =>
      db.delete(schema.gifts).where(eq(schema.gifts.id, giftId)),
    close: async () => {
      await connection.close();
      if (admin) {
        await admin.db.execute(sql.raw(`DROP SCHEMA "${namespace}" CASCADE`));
        await admin.close();
      }
    },
  };
}
