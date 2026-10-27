import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("refuses a 21-round event without removing its data or original constraints", async () => {
  const pg = new PGlite();
  const db = drizzle(pg);
  const statements = async (file: string) =>
    (await readFile(file, "utf8")).split("--> statement-breakpoint").filter((s) => s.trim());
  try {
    for (const statement of await statements("drizzle/0000_classy_northstar.sql"))
      await db.execute(sql.raw(statement));
    await db.execute(sql`
      insert into bq_games (id, question_order)
      select 'main', jsonb_agg(n) from generate_series(1, 21) as n
    `);
    const migration = await statements("drizzle/0003_twenty_participants.sql");
    await expect(
      db.transaction(async (tx) => {
        for (const statement of migration) await tx.execute(sql.raw(statement));
      }),
    ).rejects.toThrow();
    const result = await db.execute(sql`
      select jsonb_array_length(question_order)::int as count from bq_games where id = 'main'
    `);
    expect(result.rows[0].count).toBe(21);
    const constraints = await db.execute(sql`
      select pg_get_constraintdef(oid) as definition from pg_constraint
      where conname = 'bq_question_order_length'
    `);
    expect(String(constraints.rows[0].definition)).toContain("21");
  } finally {
    await pg.close();
  }
});
