import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openDatabase } from "../src/db/open";
import { seedDatabase } from "../src/db/seed";
import { generateInvitations } from "../src/server/auth";

if (
  process.env.ALLOW_LOCAL_TEST_DATABASE !== "1" ||
  !process.env.LOCAL_TEST_DATABASE_PATH ||
  process.env.NODE_ENV === "production"
)
  throw new Error("This runner is exclusively for a disposable local E2E database.");
const connection = await openDatabase();
try {
  await connection.migrate();
  await seedDatabase(connection.db);
  const links = await generateInvitations(connection.db, process.env.APP_URL!);
  await writeFile(
    join(process.env.LOCAL_TEST_DATABASE_PATH, "private-invitations.json"),
    JSON.stringify(links),
    { mode: 0o600, flag: "wx" },
  );
} finally {
  await connection.close();
}
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3300"],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
