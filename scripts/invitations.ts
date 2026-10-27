import "dotenv/config";
import { open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { openDatabase } from "../src/db/open";
import { generateInvitations } from "../src/server/auth";

const args = process.argv.slice(2);
const output = resolve(args.find((arg) => !arg.startsWith("--")) ?? "private-invitations.json");
if (args.some((arg) => arg.startsWith("--") && arg !== "--rotate"))
  throw new Error("Only --rotate is supported.");
if (!process.env.APP_URL) throw new Error("Set APP_URL to the URL participants will use.");
// Reserve a private new file first; never overwrite an existing export or print tokens.
const file = await open(output, "wx", 0o600);
let persisted = false;
let connection: Awaited<ReturnType<typeof openDatabase>> | undefined;
try {
  connection = await openDatabase();
  const links = await generateInvitations(
    connection.db,
    process.env.APP_URL,
    args.includes("--rotate"),
  );
  await file.writeFile(JSON.stringify(links, null, 2));
  await file.sync();
  persisted = true;
  console.log(
    `20 private invitations saved to ${output}. Keep this file private; links are bearer credentials.`,
  );
} finally {
  await file.close();
  await connection?.close();
  if (!persisted) await unlink(output);
}
