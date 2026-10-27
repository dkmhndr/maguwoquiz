import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function connect(url: string | undefined, searchPath?: string) {
  if (!url) throw new Error("Database is not configured. Set DATABASE_URL on the server.");
  const client = postgres(url, {
    prepare: false,
    max: 4,
    connect_timeout: 10,
    idle_timeout: 20,
    onnotice: () => {},
    ...(searchPath ? { connection: { search_path: searchPath } } : {}),
  });
  const db = drizzle(client, { schema });
  return {
    db: db as Database,
    close: () => client.end(),
    migrate: () => migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "bq_drizzle" }),
  };
}
