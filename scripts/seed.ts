import "dotenv/config";
import { openDatabase } from "../src/db/open";
import { seedDatabase } from "../src/db/seed";

const connection = await openDatabase();
try {
  await seedDatabase(connection.db);
  console.log(
    "Validated 19 participants/questions/gifts. Existing matching seed and results preserved.",
  );
} finally {
  await connection.close();
}
