import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "bonding-quiz-cli-"));
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  APP_URL: "http://quiz.test",
  ALLOW_LOCAL_TEST_DATABASE: "1",
  LOCAL_TEST_DATABASE_PATH: join(directory, "database"),
};
const run = (script: string, args: string[] = []) => {
  const output = execFileSync("npm", ["run", script, ...(args.length ? ["--", ...args] : [])], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(output.trim());
};
run("db:migrate");
run("db:migrate");
run("db:seed");
run("db:seed");
run("db:check");
const first = join(directory, "private-invitations.json");
run("invites:generate", [first]);
const data = JSON.parse(await readFile(first, "utf8")) as { url: string }[];
if (data.length !== 19 || new Set(data.map((d) => d.url)).size !== 19)
  throw new Error("Invalid invitation export.");
if (((await stat(first)).mode & 0o777) !== 0o600)
  throw new Error("Invitation export is not private.");
try {
  run("invites:generate", [join(directory, "private-invitations-blocked.json")]);
  throw new Error("Existing invitation tokens were overwritten.");
} catch (error) {
  if (!(error instanceof Error) || !("status" in error) || error.status === 0) throw error;
}
run("invites:generate", [join(directory, "private-invitations-v2.json"), "--rotate"]);
console.log(
  "CLI verification passed: migrations, safe repeated seed, private exports, refusal, and explicit rotation.",
);
