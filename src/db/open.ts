import { connect } from "./connection";
import * as schema from "./schema";
import type { Database } from "./connection";

export async function openDatabase(migration = false) {
  if (process.env.ALLOW_LOCAL_TEST_DATABASE === "1" && process.env.NODE_ENV !== "production") {
    if (!process.env.LOCAL_TEST_DATABASE_PATH)
      throw new Error("Specify a disposable LOCAL_TEST_DATABASE_PATH.");
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(process.env.LOCAL_TEST_DATABASE_PATH);
    const db = drizzle(client, { schema });
    return {
      db: db as Database,
      close: () => client.close(),
      migrate: () => migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "bq_drizzle" }),
    };
  }
  return connect(
    migration
      ? (process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL)
      : process.env.DATABASE_URL,
  );
}
