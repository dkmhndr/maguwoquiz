import "dotenv/config";
import { sql } from "drizzle-orm";
import { openDatabase } from "../src/db/open";
import { seedData, validateSeed } from "../src/seed/data";
import { allocations, games, gifts, options, participants, questions } from "../src/db/schema";

validateSeed(seedData);
const connection = await openDatabase();
try {
  for (const [label, table, expected] of [
    ["participants", participants, 20],
    ["questions", questions, 20],
    ["gifts", gifts, 20],
  ] as const) {
    const [{ count }] = await connection.db
      .select({ count: sql<number>`count(*)::int` })
      .from(table);
    if (count !== expected) throw new Error(`Expected ${expected} ${label}; found ${count}.`);
    console.log(`${label}: ${count}`);
  }
  const optionCounts = await connection.db
    .select({
      questionId: options.questionId,
      count: sql<number>`count(*)::int`,
      correct: sql<number>`sum(case when ${options.isCorrect} then 1 else 0 end)::int`,
    })
    .from(options)
    .groupBy(options.questionId);
  if (optionCounts.length !== 20 || optionCounts.some((q) => q.count !== 4 || q.correct !== 1))
    throw new Error(
      "Each of the 20 questions must have four options and exactly one correct option.",
    );
  console.log("answer options: 80; correct options: 20");
  console.log(
    "Game:",
    await connection.db
      .select({ status: games.status, round: games.currentRound, version: games.version })
      .from(games),
  );
  console.log(
    "Gift assignments:",
    await connection.db.select({ count: sql<number>`count(*)::int` }).from(allocations),
  );
} finally {
  await connection.close();
}
