import { and, asc, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import {
  allocations,
  games,
  gifts,
  invitations,
  options,
  participants,
  questions,
  rounds,
  sessions,
  submissions,
} from "../db/schema";
import type { GameState, GiftAssignment, HistoryRound } from "../shared/types";
import { rateLimit, type Identity } from "./auth";
import { AppError, requireCondition } from "./errors";
import { randomToken, shuffle } from "./crypto";

type Game = typeof games.$inferSelect;
const ANSWER_MS = 15000;
const INTERMISSION_MS = 10000;

async function databaseTime(db: Database) {
  const [row] = await db
    .select({ now: sql<string>`clock_timestamp()::text` })
    .from(games)
    .where(eq(games.id, "main"));
  requireCondition(row, "NOT_SEEDED", "Database belum disiapkan.", 503);
  return new Date(row.now);
}

async function activeRound(db: Database, game: Game) {
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.gameId, game.id), eq(rounds.number, game.currentRound)));
  return round;
}

async function startRound(db: Database, game: Game): Promise<Game> {
  requireCondition(
    game.questionOrder && game.currentRound < 20,
    "INVALID_TRANSITION",
    "Ronde tidak dapat dimulai saat ini.",
  );
  // A reconnect starts a fresh full-duration question; never skip unseen rounds to catch up.
  const now = await databaseTime(db);
  const number = game.currentRound + 1;
  await db.insert(rounds).values({
    id: randomToken(),
    gameId: game.id,
    questionId: game.questionOrder[number - 1],
    number,
    startedAt: now,
    deadline: new Date(now.getTime() + ANSWER_MS),
  });
  const [updated] = await db
    .update(games)
    .set({ status: "question_active", currentRound: number, version: game.version + 1 })
    .where(eq(games.id, game.id))
    .returning();
  return updated;
}

async function distributeGifts(db: Database, game: Game): Promise<Game> {
  const people = await db.select().from(participants).orderBy(participants.id);
  const allGifts = await db.select().from(gifts).orderBy(gifts.id);
  const assigned = await db.select().from(allocations).where(eq(allocations.gameId, game.id));
  const remainingPeople = people.filter((p) => !assigned.some((a) => a.recipientId === p.id));
  const remainingGifts = allGifts.filter((g) => !assigned.some((a) => a.giftId === g.id));
  requireCondition(
    people.length === 20 &&
      allGifts.length === 20 &&
      remainingPeople.length === remainingGifts.length,
    "GACHA_INTEGRITY",
    "Jumlah hadiah dan penerima tidak cocok. Gacha diblokir; periksa database.",
  );
  const shuffled = shuffle(remainingGifts);
  if (remainingPeople.length)
    await db.insert(allocations).values(
      remainingPeople.map((person, index) => ({
        giftId: shuffled[index].id,
        gameId: game.id,
        recipientId: person.id,
        source: "gacha",
      })),
    );
  const ledger = await db.select().from(allocations).where(eq(allocations.gameId, game.id));
  requireCondition(
    ledger.length === 20 &&
      new Set(ledger.map((a) => a.giftId)).size === 20 &&
      new Set(ledger.map((a) => a.recipientId)).size === 20,
    "GACHA_INTEGRITY",
    "Ledger hadiah tidak valid; transaksi dibatalkan.",
  );
  const [updated] = await db
    .update(games)
    .set({ status: "game_complete", version: game.version + 1 })
    .where(eq(games.id, game.id))
    .returning();
  return updated;
}

async function closeRound(db: Database, game: Game): Promise<Game> {
  const round = await activeRound(db, game);
  requireCondition(round && !round.closedAt, "ROUND_NOT_ACTIVE", "Tidak ada ronde aktif.");
  const [question] = await db.select().from(questions).where(eq(questions.id, round.questionId));
  const [winner] = await db
    .select({ participantId: submissions.participantId })
    .from(submissions)
    .innerJoin(options, and(eq(options.id, submissions.optionId), eq(options.isCorrect, true)))
    .leftJoin(
      allocations,
      and(eq(allocations.gameId, game.id), eq(allocations.recipientId, submissions.participantId)),
    )
    .where(
      and(
        eq(submissions.roundId, round.id),
        ne(submissions.participantId, question.authorId),
        isNull(allocations.giftId),
      ),
    )
    .orderBy(asc(submissions.receivedAt), asc(submissions.id))
    .limit(1);
  if (winner) {
    const [gift] = await db.select().from(gifts).where(eq(gifts.ownerId, question.authorId));
    requireCondition(gift, "GIFT_INTEGRITY", "Hadiah penulis tidak ditemukan.");
    await db.insert(allocations).values({
      gameId: game.id,
      giftId: gift.id,
      recipientId: winner.participantId,
      roundId: round.id,
      source: "round",
    });
  }
  await db
    .update(rounds)
    .set({
      closedAt: sql`clock_timestamp()`,
      revealedAt: sql`clock_timestamp()`,
      winnerId: winner?.participantId ?? null,
    })
    .where(eq(rounds.id, round.id));
  const [updated] = await db
    .update(games)
    .set({ status: "result_revealed", version: game.version + 1 })
    .where(eq(games.id, game.id))
    .returning();
  return updated;
}

// All app instances share this lock for round decisions and gift assignments.
// Rejections are thrown after commit so deadline reconciliation is not rolled back.
async function withGame<T>(
  db: Database,
  operation: (tx: Database, game: Game) => Promise<T>,
): Promise<T> {
  const outcome = await db.transaction(async (tx) => {
    let [game] = await tx.select().from(games).where(eq(games.id, "main")).for("update");
    requireCondition(game, "NOT_SEEDED", "Database belum disiapkan.", 503);
    // Recover rounds closed by the previous manual-reveal version; never reallocate gifts.
    if (game.status === "round_closed") {
      const round = await activeRound(tx, game);
      requireCondition(round?.closedAt, "ROUND_INTEGRITY", "Ronde tertutup tidak ditemukan.");
      if (!round.revealedAt)
        await tx
          .update(rounds)
          .set({ revealedAt: sql`clock_timestamp()` })
          .where(eq(rounds.id, round.id));
      const [published] = await tx
        .update(games)
        .set({ status: "result_revealed", version: game.version + 1 })
        .where(eq(games.id, game.id))
        .returning();
      game = published;
    }
    if (game.status === "question_active") {
      const round = await activeRound(tx, game);
      requireCondition(round, "ROUND_INTEGRITY", "Ronde aktif tidak ditemukan.");
      if (round.deadline <= (await databaseTime(tx))) game = await closeRound(tx, game);
    }
    if (game.autoMode && game.status === "result_revealed") {
      const round = await activeRound(tx, game);
      requireCondition(round?.revealedAt, "ROUND_INTEGRITY", "Hasil ronde tidak ditemukan.");
      if (round.revealedAt.getTime() + INTERMISSION_MS <= (await databaseTime(tx)).getTime()) {
        game =
          game.currentRound === 20 ? await distributeGifts(tx, game) : await startRound(tx, game);
      }
    }
    try {
      return await tx.transaction((operationTx) => operation(operationTx, game));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      if (game.status === "question_active") {
        const round = await activeRound(tx, game);
        if (round.deadline <= (await databaseTime(tx))) await closeRound(tx, game);
      }
      return error;
    }
  });
  if (outcome instanceof AppError) throw outcome;
  return outcome;
}

export async function getState(db: Database, identity: Identity): Promise<GameState> {
  return withGame(db, async (tx, game) => {
    const now = await databaseTime(tx);
    const people = await tx.select().from(participants).orderBy(participants.id);
    const round = await activeRound(tx, game);
    const answers = round
      ? await tx
          .select()
          .from(submissions)
          .where(eq(submissions.roundId, round.id))
          .orderBy(submissions.receivedAt, submissions.id)
      : [];
    const activeSessions = await tx
      .select({ participantId: sessions.participantId })
      .from(sessions)
      .innerJoin(invitations, eq(invitations.id, sessions.invitationId))
      .where(
        and(
          eq(sessions.role, "participant"),
          isNull(invitations.revokedAt),
          gt(sessions.expiresAt, now),
          gt(sessions.lastSeenAt, new Date(now.getTime() - 30000)),
        ),
      );
    const awardRows = await tx
      .select({
        award: allocations,
        gift: { id: gifts.id, ownerId: gifts.ownerId },
        revealTime: rounds.revealedAt,
      })
      .from(allocations)
      .innerJoin(gifts, eq(gifts.id, allocations.giftId))
      .leftJoin(rounds, eq(rounds.id, allocations.roundId))
      .where(eq(allocations.gameId, game.id));
    // Only published assignments are visible; gift contents are never sent to a browser.
    const ledger: GiftAssignment[] = awardRows
      .filter((row) => row.award.source === "gacha" || row.revealTime !== null)
      .map(({ award, gift }) => ({
        giftId: gift.id,
        ownerId: gift.ownerId,
        ownerName: people.find((p) => p.id === gift.ownerId)!.name,
        recipientId: award.recipientId,
        recipientName: people.find((p) => p.id === award.recipientId)!.name,
        source: award.source as "round" | "gacha",
      }));
    const submitted =
      identity.role === "participant"
        ? answers.find((answer) => answer.participantId === identity.participantId)
        : undefined;
    const state: GameState = {
      status: game.status as GameState["status"],
      initialized: game.questionOrder !== null,
      autoMode: game.autoMode,
      intermissionEndsAt:
        game.autoMode && game.status === "result_revealed" && round?.revealedAt
          ? new Date(round.revealedAt.getTime() + INTERMISSION_MS).toISOString()
          : null,
      version: game.version,
      roundNumber: game.currentRound,
      serverNow: now.toISOString(),
      participants: people.map((p) => ({
        ...p,
        online: activeSessions.some((s) => s.participantId === p.id),
        submitted: answers.some((a) => a.participantId === p.id),
        hasGift: ledger.some((a) => a.recipientId === p.id),
      })),
      me:
        identity.role === "participant"
          ? people.find((p) => p.id === identity.participantId)!
          : null,
      round: null,
      ledger,
      myGift:
        identity.role === "participant"
          ? (ledger.find((a) => a.recipientId === identity.participantId) ?? null)
          : null,
      ranking: null,
      submission: submitted
        ? { optionId: submitted.optionId, receivedAt: submitted.receivedAt.toISOString() }
        : null,
    };
    if (round) {
      const [question] = await tx
        .select()
        .from(questions)
        .where(eq(questions.id, round.questionId));
      const choices = await tx
        .select()
        .from(options)
        .where(eq(options.questionId, question.id))
        .orderBy(options.position);
      state.round = {
        id: round.id,
        number: round.number,
        text: question.text,
        authorId: question.authorId,
        authorName: people.find((p) => p.id === question.authorId)!.name,
        options: choices.map((o) => ({ id: o.id, label: o.label, position: o.position })),
        startedAt: round.startedAt.toISOString(),
        deadline: round.deadline.toISOString(),
        closed: round.closedAt !== null,
        revealed: round.revealedAt !== null,
        submissionCount: answers.length,
      };
      if (round.revealedAt) {
        const correctOptionId = choices.find((o) => o.isCorrect)!.id;
        state.round.correctOptionId = correctOptionId;
        state.round.winnerId = round.winnerId;
        if (state.submission)
          state.submission.correct = state.submission.optionId === correctOptionId;
        if (identity.role === "host")
          state.round.logs = answers.map((answer) => ({
            participantId: answer.participantId,
            participantName: people.find((p) => p.id === answer.participantId)!.name,
            optionId: answer.optionId,
            receivedAt: answer.receivedAt.toISOString(),
            correct: answer.optionId === correctOptionId,
            eligible: !awardRows.some(
              ({ award }) =>
                award.recipientId === answer.participantId && award.roundId !== round.id,
            ),
          }));
      }
    }
    if (game.status === "game_complete") {
      const scores = await tx
        .select({
          participantId: submissions.participantId,
          correctCount: sql<number>`count(*)::int`,
        })
        .from(submissions)
        .innerJoin(rounds, eq(rounds.id, submissions.roundId))
        .innerJoin(questions, eq(questions.id, rounds.questionId))
        .innerJoin(options, eq(options.id, submissions.optionId))
        .where(
          and(
            eq(rounds.gameId, game.id),
            ne(submissions.participantId, questions.authorId),
            isNotNull(rounds.revealedAt),
            eq(options.isCorrect, true),
          ),
        )
        .groupBy(submissions.participantId);
      const counts = new Map(scores.map((score) => [score.participantId, score.correctCount]));
      const sorted = people
        .map((person) => ({
          participantId: person.id,
          participantName: person.name,
          correctCount: counts.get(person.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.correctCount - a.correctCount || a.participantId.localeCompare(b.participantId),
        );
      state.ranking = sorted.map((entry, index) => ({
        ...entry,
        rank:
          index > 0 && entry.correctCount === sorted[index - 1].correctCount
            ? sorted.findIndex((person) => person.correctCount === entry.correctCount) + 1
            : index + 1,
      }));
    }
    return state;
  });
}

export async function submitAnswer(
  db: Database,
  identity: Identity,
  input: { roundId: string; optionId: string },
) {
  requireCondition(
    identity.role === "participant",
    "FORBIDDEN",
    "Hanya peserta dapat menjawab.",
    403,
  );
  await rateLimit(db, `answer:${identity.participantId}`, 60);
  return withGame(db, async (tx, game) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, identity.sessionHash),
          gt(sessions.expiresAt, sql`clock_timestamp()`),
        ),
      );
    requireCondition(session, "UNAUTHENTICATED", "Sesi berakhir.", 401);
    requireCondition(game.status === "question_active", "ROUND_CLOSED", "Ronde sudah ditutup.");
    const round = await activeRound(tx, game);
    requireCondition(
      round && round.id === input.roundId,
      "STALE_ROUND",
      "Jawaban berasal dari ronde lain.",
    );
    const [question] = await tx.select().from(questions).where(eq(questions.id, round.questionId));
    requireCondition(
      question.authorId !== identity.participantId,
      "AUTHOR_EXCLUDED",
      "Kamu tidak dapat menjawab pertanyaanmu sendiri.",
      403,
    );
    const [existing] = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.roundId, round.id),
          eq(submissions.participantId, identity.participantId),
        ),
      );
    requireCondition(
      !existing,
      "DUPLICATE_SUBMISSION",
      "Jawabanmu sudah tersimpan dan tidak dapat diubah.",
    );
    const [choice] = await tx
      .select({ id: options.id })
      .from(options)
      .where(and(eq(options.id, input.optionId), eq(options.questionId, round.questionId)));
    requireCondition(choice, "INVALID_OPTION", "Pilihan tidak termasuk pertanyaan aktif.", 400);
    // Check the deadline in the insertion statement too, not just before queued work.
    const accepted = await tx.execute(sql`
      with receipt as materialized (select clock_timestamp() as at)
      insert into ${submissions} (round_id, question_id, game_id, participant_id, option_id, received_at)
      select ${round.id}, ${round.questionId}, ${game.id}, ${identity.participantId}, ${choice.id}, receipt.at
      from ${rounds}, receipt where ${rounds.id} = ${round.id} and ${rounds.deadline} > receipt.at and ${rounds.closedAt} is null
      returning id
    `);
    const acceptedCount = Array.isArray(accepted)
      ? accepted.length
      : (accepted as { rows: unknown[] }).rows.length;
    if (!acceptedCount) {
      throw new AppError("ROUND_CLOSED", "Waktu habis. Jawaban terlambat ditolak.");
    }
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(eq(submissions.roundId, round.id));
    if (count === 19 && !game.autoMode) await closeRound(tx, game);
    return { ok: true as const };
  });
}

export async function hostAction(
  db: Database,
  identity: Identity,
  action: string,
  version: number,
) {
  requireCondition(identity.role === "host", "FORBIDDEN", "Hanya host dapat mengontrol game.", 403);
  return withGame(db, async (tx, game) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, identity.sessionHash),
          eq(sessions.role, "host"),
          gt(sessions.expiresAt, sql`clock_timestamp()`),
        ),
      );
    requireCondition(session, "UNAUTHENTICATED", "Sesi host berakhir.", 403);
    if (action === "gacha" && game.status === "game_complete") return;
    requireCondition(
      game.version === version,
      "STALE_STATE",
      "Status sudah berubah. Periksa layar sebelum mencoba lagi.",
    );
    if (action === "auto_on" || action === "auto_off") {
      requireCondition(
        game.status === "lobby" && game.currentRound === 0,
        "INVALID_TRANSITION",
        "Pilih mode sebelum ronde pertama dimulai.",
      );
      await tx
        .update(games)
        .set({ autoMode: action === "auto_on", version: game.version + 1 })
        .where(eq(games.id, game.id));
      return;
    }
    requireCondition(
      !game.autoMode || !["close", "advance", "gacha"].includes(action),
      "INVALID_TRANSITION",
      "Full Auto mengatur waktu ronde, jeda, dan hadiah secara otomatis.",
    );
    if (action === "initialize") {
      requireCondition(
        !game.questionOrder && game.status === "lobby",
        "ALREADY_INITIALIZED",
        "Game sudah diinisialisasi.",
      );
      const allQuestions = await tx
        .select({ id: questions.id })
        .from(questions)
        .orderBy(questions.id);
      requireCondition(
        allQuestions.length === 20,
        "SEED_INTEGRITY",
        "Game memerlukan tepat 20 pertanyaan.",
      );
      await tx
        .update(games)
        .set({ questionOrder: shuffle(allQuestions.map((q) => q.id)), version: game.version + 1 })
        .where(eq(games.id, game.id));
      return;
    }
    if (action === "start") {
      requireCondition(
        game.status === "lobby" && game.questionOrder && game.currentRound < 20,
        "INVALID_TRANSITION",
        "Ronde tidak dapat dimulai saat ini.",
      );
      await startRound(tx, game);
      return;
    }
    if (action === "close") {
      requireCondition(
        game.status === "question_active",
        "INVALID_TRANSITION",
        "Tidak ada ronde aktif untuk ditutup.",
      );
      await closeRound(tx, game);
      return;
    }
    if (action === "advance") {
      requireCondition(
        game.status === "result_revealed",
        "INVALID_TRANSITION",
        "Buka hasil sebelum lanjut.",
      );
      await tx
        .update(games)
        .set({
          status: game.currentRound === 20 ? "final_gacha" : "lobby",
          version: game.version + 1,
        })
        .where(eq(games.id, game.id));
      return;
    }
    if (action === "gacha") {
      requireCondition(
        game.status === "final_gacha" && game.currentRound === 20,
        "INVALID_TRANSITION",
        "Selesaikan seluruh ronde sebelum gacha.",
      );
      await distributeGifts(tx, game);
      return;
    }
    requireCondition(false, "INVALID_TRANSITION", "Aksi tidak tersedia pada status ini.");
  });
}

export async function reconcileGame(db: Database) {
  return withGame(db, async () => ({ ok: true }));
}

export async function getHistory(
  db: Database,
  identity: Identity,
): Promise<{ rounds: HistoryRound[] }> {
  requireCondition(identity.role === "host", "FORBIDDEN", "Arsip hanya tersedia untuk host.", 403);
  return withGame(db, async (tx, game) => {
    const revealed = await tx
      .select()
      .from(rounds)
      .where(and(eq(rounds.gameId, game.id), isNotNull(rounds.revealedAt)))
      .orderBy(rounds.number);
    const people = await tx.select().from(participants);
    const allQuestions = await tx.select().from(questions);
    const allOptions = await tx.select().from(options);
    const answers = await tx
      .select({ answer: submissions })
      .from(submissions)
      .innerJoin(rounds, eq(rounds.id, submissions.roundId))
      .where(isNotNull(rounds.revealedAt))
      .orderBy(submissions.receivedAt, submissions.id);
    const awards = await tx.select().from(allocations).where(eq(allocations.gameId, game.id));
    return {
      rounds: revealed.map((round) => {
        const question = allQuestions.find((q) => q.id === round.questionId)!;
        return {
          id: round.id,
          number: round.number,
          text: question.text,
          authorName: people.find((p) => p.id === question.authorId)!.name,
          correctLabel: allOptions.find((o) => o.questionId === question.id && o.isCorrect)!.label,
          winnerName: people.find((p) => p.id === round.winnerId)?.name ?? null,
          logs: answers
            .filter(({ answer }) => answer.roundId === round.id)
            .map(({ answer }) => {
              const choice = allOptions.find((o) => o.id === answer.optionId)!;
              return {
                participantId: answer.participantId,
                participantName: people.find((p) => p.id === answer.participantId)!.name,
                optionLabel: choice.label,
                receivedAt: answer.receivedAt.toISOString(),
                correct: choice.isCorrect,
                eligible: !awards.some(
                  (a) =>
                    a.recipientId === answer.participantId &&
                    a.roundId !== round.id &&
                    a.allocatedAt <= round.closedAt!,
                ),
              };
            }),
        };
      }),
    };
  });
}
