import "dotenv/config";
import { sql } from "drizzle-orm";
import { openDatabase } from "../src/db/open";

const connection = await openDatabase(true);
try {
  const existing = await connection.db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' and left(table_name, 3) = 'bq_' order by table_name`,
  );
  console.log("Inspecting existing quiz tables and applying recorded migrations:", existing);
  await connection.migrate();
  console.log("Migrations applied. No existing game state was reset.");
} finally {
  await connection.close();
}
