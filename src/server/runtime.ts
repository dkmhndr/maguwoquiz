import "server-only";
import { openDatabase } from "../db/open";
import { createHandler } from "./http";

const runtime = globalThis as typeof globalThis & {
  quizHandler?: Promise<ReturnType<typeof createHandler>>;
};

export async function handleRequest(request: Request) {
  try {
    if (!runtime.quizHandler)
      runtime.quizHandler = (async () => {
        const production = process.env.NODE_ENV === "production";
        const appUrl = process.env.APP_URL ?? (production ? "" : "http://localhost:3000");
        if (!appUrl || (production && new URL(appUrl).protocol !== "https:"))
          throw new Error("Set an HTTPS APP_URL in production.");
        const { db } = await openDatabase();
        return createHandler(db, {
          appUrl,
          hostPasswordHash: process.env.HOST_PASSWORD_HASH ?? "",
          secureCookies: production,
          cronSecret: process.env.CRON_SECRET,
        });
      })();
    return await (
      await runtime.quizHandler
    )(request);
  } catch {
    runtime.quizHandler = undefined;
    return Response.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "Server belum siap. Host perlu memeriksa konfigurasi database.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
