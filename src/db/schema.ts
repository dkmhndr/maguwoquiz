import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const participants = pgTable("bq_participants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const invitations = pgTable(
  "bq_invitation_tokens",
  {
    id: text("id").primaryKey(),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    tokenHash: text("token_hash").notNull().unique(),
    revokedAt: time("revoked_at"),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bq_one_live_invitation")
      .on(t.participantId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

export const sessions = pgTable(
  "bq_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    role: text("role").notNull(),
    participantId: text("participant_id").references(() => participants.id),
    invitationId: text("invitation_id").references(() => invitations.id),
    hostVersion: text("host_version"),
    expiresAt: time("expires_at").notNull(),
    lastSeenAt: time("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "bq_session_identity",
      sql`(${t.role} = 'participant' and ${t.participantId} is not null and ${t.invitationId} is not null and ${t.hostVersion} is null) or (${t.role} = 'host' and ${t.participantId} is null and ${t.invitationId} is null and ${t.hostVersion} is not null)`,
    ),
    index("bq_sessions_expiry").on(t.expiresAt),
    index("bq_sessions_participant").on(t.participantId),
  ],
);

export const questions = pgTable(
  "bq_questions",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .unique()
      .references(() => participants.id),
    text: text("text").notNull(),
  },
  (t) => [unique("bq_question_author_pair").on(t.id, t.authorId)],
);

export const options = pgTable(
  "bq_answer_options",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    isCorrect: boolean("is_correct").notNull(),
  },
  (t) => [
    unique("bq_option_question_pair").on(t.id, t.questionId),
    unique("bq_option_position").on(t.questionId, t.position),
    uniqueIndex("bq_one_correct_option")
      .on(t.questionId)
      .where(sql`${t.isCorrect}`),
    check("bq_option_position_range", sql`${t.position} between 0 and 3`),
  ],
);

export const gifts = pgTable("bq_gifts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => participants.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
});

export const games = pgTable(
  "bq_games",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull().default("lobby"),
    questionOrder: jsonb("question_order").$type<string[]>(),
    currentRound: integer("current_round").notNull().default(0),
    autoMode: boolean("auto_mode").notNull().default(false),
    version: integer("version").notNull().default(0),
  },
  (t) => [
    check("bq_single_event", sql`${t.id} = 'main'`),
    check(
      "bq_game_status",
      sql`${t.status} in ('lobby', 'question_active', 'round_closed', 'result_revealed', 'final_gacha', 'game_complete')`,
    ),
    check("bq_round_number", sql`${t.currentRound} between 0 and 19`),
    check(
      "bq_question_order_length",
      sql`${t.questionOrder} is null or jsonb_array_length(${t.questionOrder}) = 19`,
    ),
  ],
);

export const rounds = pgTable(
  "bq_rounds",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id),
    number: integer("number").notNull(),
    startedAt: time("started_at").notNull(),
    deadline: time("deadline").notNull(),
    closedAt: time("closed_at"),
    revealedAt: time("revealed_at"),
    winnerId: text("winner_id").references(() => participants.id),
  },
  (t) => [
    unique("bq_round_number_unique").on(t.gameId, t.number),
    unique("bq_question_once").on(t.gameId, t.questionId),
    unique("bq_round_question_game").on(t.id, t.questionId, t.gameId),
    uniqueIndex("bq_one_active_round")
      .on(t.gameId)
      .where(sql`${t.closedAt} is null`),
    check("bq_valid_round_number", sql`${t.number} between 1 and 19`),
    check("bq_valid_deadline", sql`${t.deadline} > ${t.startedAt}`),
  ],
);

export const submissions = pgTable(
  "bq_submissions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    roundId: text("round_id").notNull(),
    questionId: text("question_id").notNull(),
    gameId: text("game_id").notNull(),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    optionId: text("option_id").notNull(),
    receivedAt: time("received_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    unique("bq_one_submission").on(t.roundId, t.participantId),
    foreignKey({
      columns: [t.roundId, t.questionId, t.gameId],
      foreignColumns: [rounds.id, rounds.questionId, rounds.gameId],
      name: "bq_submission_round",
    }),
    foreignKey({
      columns: [t.optionId, t.questionId],
      foreignColumns: [options.id, options.questionId],
      name: "bq_submission_option",
    }),
    index("bq_submission_order").on(t.roundId, t.receivedAt, t.id),
  ],
);

export const allocations = pgTable(
  "bq_gift_allocations",
  {
    giftId: text("gift_id")
      .primaryKey()
      .references(() => gifts.id),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => participants.id),
    roundId: text("round_id").references(() => rounds.id),
    source: text("source").notNull(),
    allocatedAt: time("allocated_at")
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    unique("bq_one_gift_per_recipient").on(t.gameId, t.recipientId),
    unique("bq_one_award_per_round").on(t.roundId),
    check(
      "bq_allocation_source",
      sql`(${t.source} = 'round' and ${t.roundId} is not null) or (${t.source} = 'gacha' and ${t.roundId} is null)`,
    ),
  ],
);

export const rateLimits = pgTable("bq_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: time("window_start")
    .notNull()
    .default(sql`clock_timestamp()`),
  count: integer("count").notNull().default(1),
});
