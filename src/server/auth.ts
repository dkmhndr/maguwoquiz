import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import { games, invitations, participants, rateLimits, sessions } from "../db/schema";
import { hashToken, randomToken, verifyPassword } from "./crypto";
import { AppError, requireCondition } from "./errors";

export type Identity =
  | { role: "host"; sessionHash: string }
  | { role: "participant"; participantId: string; sessionHash: string };
export type AuthConfig = {
  hostPasswordHash: string;
  secureCookies: boolean;
  appUrl: string;
  cronSecret?: string;
};

export async function rateLimit(db: Database, key: string, maximum: number) {
  const expired = sql`${rateLimits.windowStart} < clock_timestamp() - interval '60 seconds'`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: hashToken(key) })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then clock_timestamp() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  requireCondition(
    row.count <= maximum,
    "RATE_LIMITED",
    "Terlalu banyak percobaan. Coba lagi dalam satu menit.",
    429,
  );
}

export async function generateInvitations(db: Database, appUrl: string, rotate = false) {
  const origin = new URL(appUrl).origin;
  return db.transaction(async (tx) => {
    await tx.select().from(games).where(eq(games.id, "main")).for("update");
    const people = await tx.select().from(participants).orderBy(participants.id);
    requireCondition(
      people.length === 19,
      "NOT_SEEDED",
      "Seed exactly 19 participants before generating invitations.",
    );
    const existing = await tx.select().from(invitations).where(isNull(invitations.revokedAt));
    requireCondition(
      existing.length === 0 || rotate,
      "INVITES_EXIST",
      "Links already exist. Use the saved private export or explicitly rotate them.",
    );
    if (rotate) {
      await tx
        .update(invitations)
        .set({ revokedAt: sql`clock_timestamp()` })
        .where(isNull(invitations.revokedAt));
      await tx.delete(sessions).where(eq(sessions.role, "participant"));
    }
    const links = [];
    for (const person of people) {
      const token = randomToken();
      await tx
        .insert(invitations)
        .values({ id: randomToken(), participantId: person.id, tokenHash: hashToken(token) });
      links.push({ participantId: person.id, name: person.name, url: `${origin}/join#${token}` });
    }
    return links;
  });
}

export async function exchangeInvitation(db: Database, token: string) {
  await rateLimit(db, "invitation-exchange", 200);
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.revokedAt)))
      .for("update");
    requireCondition(invite, "INVALID_INVITATION", "Undangan tidak valid atau sudah dicabut.", 401);
    const session = randomToken();
    await tx.insert(sessions).values({
      tokenHash: hashToken(session),
      role: "participant",
      participantId: invite.participantId,
      invitationId: invite.id,
      expiresAt: sql`clock_timestamp() + interval '7 days'`,
    });
    return session;
  });
}

export async function loginHost(db: Database, password: string, config: AuthConfig) {
  await rateLimit(db, "host-login", 10);
  requireCondition(
    config.hostPasswordHash,
    "HOST_NOT_CONFIGURED",
    "Akses host belum dikonfigurasi.",
    503,
  );
  requireCondition(
    verifyPassword(password, config.hostPasswordHash),
    "INVALID_CREDENTIALS",
    "Kata sandi tidak sesuai.",
    401,
  );
  const token = randomToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    role: "host",
    hostVersion: hashToken(config.hostPasswordHash),
    expiresAt: sql`clock_timestamp() + interval '12 hours'`,
  });
  return token;
}

export function sessionCookie(
  role: "host" | "participant",
  token: string,
  config: AuthConfig,
  clear = false,
) {
  return `${role === "host" ? "bq_host" : "bq_player"}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : role === "host" ? 43200 : 604800}${config.secureCookies ? "; Secure" : ""}`;
}

export async function authenticate(
  db: Database,
  request: Request,
  role: "host" | "participant",
  config: AuthConfig,
): Promise<Identity> {
  const name = role === "host" ? "bq_host" : "bq_player";
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AppError(
      "UNAUTHENTICATED",
      "Sesi berakhir. Buka undangan atau masuk kembali.",
      role === "host" ? 403 : 401,
    );
  const sessionHash = hashToken(token);
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, sessionHash),
        eq(sessions.role, role),
        gt(sessions.expiresAt, sql`clock_timestamp()`),
      ),
    );
  requireCondition(
    session,
    "UNAUTHENTICATED",
    "Sesi berakhir. Masuk kembali.",
    role === "host" ? 403 : 401,
  );
  if (role === "participant") {
    const [invite] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, session.invitationId!),
          eq(invitations.participantId, session.participantId!),
          isNull(invitations.revokedAt),
        ),
      );
    requireCondition(invite, "UNAUTHENTICATED", "Undangan telah dicabut.", 401);
  } else {
    requireCondition(
      session.hostVersion === hashToken(config.hostPasswordHash),
      "UNAUTHENTICATED",
      "Akses host telah berubah.",
      403,
    );
  }
  // Throttle presence writes; presence is approximate, not an authorization input.
  await db
    .update(sessions)
    .set({ lastSeenAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(sessions.tokenHash, sessionHash),
        sql`${sessions.lastSeenAt} < clock_timestamp() - interval '10 seconds'`,
      ),
    );
  return role === "host"
    ? { role, sessionHash }
    : { role, participantId: session.participantId!, sessionHash };
}
