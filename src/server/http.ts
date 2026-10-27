import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/connection";
import { sessions } from "../db/schema";
import {
  authenticate,
  exchangeInvitation,
  loginHost,
  sessionCookie,
  type AuthConfig,
} from "./auth";
import { AppError, requireCondition } from "./errors";
import { getHistory, getState, hostAction, submitAnswer } from "./game";
import { reconcileGame } from "./game";
import { hashToken } from "./crypto";
import { timingSafeEqual } from "node:crypto";

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers },
  });

export function createHandler(db: Database, config: AuthConfig) {
  return async function handle(request: Request): Promise<Response> {
    try {
      const path = new URL(request.url).pathname.replace(/^\/api\//, "");
      if (path === "reconcile" && request.method === "GET") {
        const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        requireCondition(
          config.cronSecret &&
            config.cronSecret.length >= 32 &&
            timingSafeEqual(
              Buffer.from(hashToken(supplied)),
              Buffer.from(hashToken(config.cronSecret)),
            ),
          "FORBIDDEN",
          "Akses ditolak.",
          403,
        );
        return json(await reconcileGame(db));
      }
      if (request.method === "POST") {
        requireCondition(
          request.headers.get("origin") === new URL(config.appUrl).origin,
          "INVALID_ORIGIN",
          "Permintaan lintas situs ditolak.",
          403,
        );
        requireCondition(
          request.headers.get("content-type")?.startsWith("application/json"),
          "INVALID_CONTENT_TYPE",
          "Kirim data JSON.",
          415,
        );
        requireCondition(
          Number(request.headers.get("content-length") ?? 0) <= 8192,
          "PAYLOAD_TOO_LARGE",
          "Data terlalu besar.",
          413,
        );
      }
      const read = async () => {
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 8192) {
              await reader.cancel();
              throw new AppError("PAYLOAD_TOO_LARGE", "Data terlalu besar.", 413);
            }
            chunks.push(value);
          }
        }
        try {
          return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
          );
        } catch {
          throw new AppError("INVALID_JSON", "Data tidak valid.", 400);
        }
      };
      if (path === "invite" && request.method === "POST") {
        const { token } = z
          .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
          .strict()
          .parse(await read());
        const session = await exchangeInvitation(db, token);
        return json({ ok: true }, 200, {
          "Set-Cookie": sessionCookie("participant", session, config),
        });
      }
      if (path === "host/login" && request.method === "POST") {
        const { password } = z
          .object({ password: z.string().min(1).max(256) })
          .strict()
          .parse(await read());
        const token = await loginHost(db, password, config);
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("host", token, config) });
      }
      const role = path.startsWith("host/") ? "host" : "participant";
      const identity = await authenticate(db, request, role, config);
      if ((path === "state" || path === "host/state") && request.method === "GET")
        return json(await getState(db, identity));
      if (path === "host/history" && request.method === "GET")
        return json(await getHistory(db, identity));
      if (path === "answer" && request.method === "POST") {
        const input = z
          .object({ roundId: z.string().min(1).max(64), optionId: z.string().min(1).max(64) })
          .strict()
          .parse(await read());
        return json(await submitAnswer(db, identity, input));
      }
      if (path === "host/action" && request.method === "POST") {
        const { action, version } = z
          .object({
            action: z.enum([
              "initialize",
              "start",
              "close",
              "advance",
              "gacha",
              "auto_on",
              "auto_off",
            ]),
            version: z.number().int().nonnegative(),
          })
          .strict()
          .parse(await read());
        await hostAction(db, identity, action, version);
        return json({ ok: true });
      }
      if ((path === "logout" || path === "host/logout") && request.method === "POST") {
        await db.delete(sessions).where(eq(sessions.tokenHash, identity.sessionHash));
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(role, "", config, true) });
      }
      return json({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
    } catch (error) {
      if (error instanceof AppError)
        return json(
          { error: { code: error.code, message: error.message } },
          error.status,
          error.status === 429 ? { "Retry-After": "60" } : {},
        );
      if (error instanceof z.ZodError)
        return json(
          { error: { code: "INVALID_INPUT", message: "Data permintaan tidak valid." } },
          400,
        );
      // Never log request bodies, credentials, database URLs, tokens, or raw driver errors.
      return json(
        {
          error: {
            code: "SERVER_ERROR",
            message: "Server tidak dapat memproses permintaan. Coba lagi.",
          },
        },
        503,
      );
    }
  };
}
