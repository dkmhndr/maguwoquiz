import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

async function executeFile(db: ReturnType<typeof drizzle>, file: string) {
  const statements = (await readFile(file, "utf8")).split("--> statement-breakpoint");
  for (const statement of statements) if (statement.trim()) await db.execute(sql.raw(statement));
}

async function oldDatabase() {
  const pg = new PGlite();
  const db = drizzle(pg);
  for (const file of [
    "0000_classy_northstar",
    "0001_private_tables",
    "0002_full_auto_mode",
    "0003_twenty_participants",
  ])
    await executeFile(db, `drizzle/${file}.sql`);
  await db.execute(sql`insert into bq_games (id) values ('main')`);
  await db.execute(
    sql`insert into bq_participants (id, name) values ('p02', 'Farid Inawan'), ('p19', 'Syauqy'), ('p03', 'Dika')`,
  );
  await db.execute(
    sql`insert into bq_questions (id, author_id, text) values ('q02', 'p02', 'a'), ('q19', 'p19', 'b'), ('q03', 'p03', 'c')`,
  );
  await db.execute(
    sql`insert into bq_gifts (id, owner_id, name, description) values ('g02', 'p02', 'a', ''), ('g19', 'p19', 'b', ''), ('g03', 'p03', 'c', '')`,
  );
  await db.execute(
    sql`insert into bq_invitation_tokens (id, participant_id, token_hash) values ('i02', 'p02', 't02'), ('i19', 'p19', 't19'), ('i03', 'p03', 't03')`,
  );
  return { db, pg };
}

it("removes only Syauqy and preserves Farid and other invitations", async () => {
  const { db, pg } = await oldDatabase();
  try {
    await db.transaction(async (tx) =>
      executeFile(tx as unknown as typeof db, "drizzle/0004_amusing_jack_flag.sql"),
    );
    const people = await db.execute(sql`select id from bq_participants order by id`);
    const invitations = await db.execute(sql`select id from bq_invitation_tokens order by id`);
    expect(people.rows).toEqual([{ id: "p02" }, { id: "p03" }]);
    expect(invitations.rows).toEqual([{ id: "i02" }, { id: "i03" }]);
  } finally {
    await pg.close();
  }
});

it("refuses to remove participants from an initialized event", async () => {
  const { db, pg } = await oldDatabase();
  try {
    await db.execute(
      sql`update bq_games set question_order = (select jsonb_agg(n) from generate_series(1, 20) n)`,
    );
    await expect(
      db.transaction(async (tx) =>
        executeFile(tx as unknown as typeof db, "drizzle/0004_amusing_jack_flag.sql"),
      ),
    ).rejects.toThrow();
    const people = await db.execute(sql`select count(*)::int as count from bq_participants`);
    expect(people.rows[0].count).toBe(3);
  } finally {
    await pg.close();
  }
});

it("refuses to migrate when Farid is missing from an existing event", async () => {
  const { db, pg } = await oldDatabase();
  try {
    await db.execute(sql`delete from bq_invitation_tokens where participant_id = 'p02'`);
    await db.execute(sql`delete from bq_questions where author_id = 'p02'`);
    await db.execute(sql`delete from bq_gifts where owner_id = 'p02'`);
    await db.execute(sql`delete from bq_participants where id = 'p02'`);
    await expect(
      db.transaction(async (tx) =>
        executeFile(tx as unknown as typeof db, "drizzle/0004_amusing_jack_flag.sql"),
      ),
    ).rejects.toThrow();
    const people = await db.execute(sql`select id from bq_participants order by id`);
    expect(people.rows).toEqual([{ id: "p03" }, { id: "p19" }]);
  } finally {
    await pg.close();
  }
});
