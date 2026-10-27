import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

export const randomToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new Error("Use a host password of 12-256 characters.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, encoded: string) {
  if (password.length > 256) return false;
  const [method, salt, value] = encoded.split(":");
  if (
    method !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(value ?? "")
  )
    return false;
  return timingSafeEqual(Buffer.from(value, "hex"), scryptSync(password, salt, 64));
}

export function shuffle<T>(input: readonly T[]): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index--) {
    const target = randomInt(index + 1);
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}
