import { eq } from "drizzle-orm";
import type { Database } from "./connection";
import { games, gifts, options, participants, questions } from "./schema";
import { seedData, validateSeed, type SeedEntry } from "../seed/data";

export async function seedDatabase(db: Database, input: unknown = seedData) {
  const entries = validateSeed(input);
  await db.transaction(async (tx) => {
    await tx.insert(games).values({ id: "main" }).onConflictDoNothing();
    await tx.select().from(games).where(eq(games.id, "main")).for("update");
    const existing = await tx.select().from(participants);
    if (existing.length) {
      const qs = await tx.select().from(questions);
      const os = await tx.select().from(options);
      const gs = await tx.select().from(gifts);
      const reconstructed: SeedEntry[] = existing.map((person) => {
        const question = qs.find((q) => q.authorId === person.id);
        const gift = gs.find((g) => g.ownerId === person.id);
        if (!question || !gift)
          throw new Error("Incomplete seed exists. Refusing to overwrite it.");
        return {
          ...person,
          gift,
          question: {
            ...question,
            options: os
              .filter((o) => o.questionId === question.id)
              .sort((a, b) => a.position - b.position)
              .map((o) => ({ id: o.id, label: o.label, correct: o.isCorrect })),
          },
        };
      });
      const canonical = (data: SeedEntry[]) =>
        JSON.stringify(
          data
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((p) => ({
              id: p.id,
              name: p.name,
              question: {
                id: p.question.id,
                authorId: p.question.authorId,
                text: p.question.text,
                options: p.question.options,
              },
              gift: {
                id: p.gift.id,
                ownerId: p.gift.ownerId,
                name: p.gift.name,
                description: p.gift.description,
              },
            })),
        );
      if (canonical(validateSeed(reconstructed)) !== canonical(entries))
        throw new Error("Seed differs from existing content. Refusing to overwrite event data.");
      return;
    }
    for (const person of entries) {
      await tx.insert(participants).values({ id: person.id, name: person.name });
      await tx
        .insert(questions)
        .values({ id: person.question.id, authorId: person.id, text: person.question.text });
      await tx.insert(options).values(
        person.question.options.map((o, position) => ({
          id: o.id,
          questionId: person.question.id,
          label: o.label,
          isCorrect: o.correct,
          position,
        })),
      );
      await tx.insert(gifts).values(person.gift);
    }
  });
}
