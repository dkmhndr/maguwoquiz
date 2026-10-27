import { createInterface } from "node:readline/promises";
import { hashPassword } from "../src/server/crypto";

// Read a piped password without echoing it or placing it in command arguments/history.
if (process.stdin.isTTY)
  throw new Error(
    "Pipe a password on stdin. Example: read -s quiz_password; printf '%s' \"$quiz_password\" | npm run host:password",
  );
const input = createInterface({ input: process.stdin });
let password = "";
for await (const line of input) {
  password = line;
  break;
}
console.log(`HOST_PASSWORD_HASH=${hashPassword(password)}`);
