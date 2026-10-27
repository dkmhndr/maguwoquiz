import { describe, expect, it } from "vitest";
import { seedData, validateSeed } from "../src/seed/data";

describe("event seed", () => {
  it("accepts exactly 20 authors each with one question, four options, one key, and one gift", () => {
    expect(validateSeed(seedData)).toHaveLength(20);
  });
  it("preserves the supplied participant order and answer keys", () => {
    expect(seedData.map((person) => person.name)).toEqual([
      "Gita",
      "Farid Inawan",
      "Dika",
      "Dhama",
      "Regina",
      "Rio",
      "Vania",
      "Hafizal",
      "Margina",
      "Jihad",
      "Farras",
      "Nadia",
      "Farid Pangari",
      "DhanP",
      "Annisa",
      "Gilang",
      "Dany",
      "Ari",
      "Syauqy",
      "Khasin",
    ]);
    expect(
      seedData.map((person) => person.question.options.findIndex((option) => option.correct)),
    ).toEqual([1, 2, 1, 3, 1, 2, 3, 1, 2, 0, 3, 1, 2, 0, 1, 2, 3, 0, 2, 1]);
  });
  it("rejects missing participants", () => {
    expect(() => validateSeed(seedData.slice(1))).toThrow();
  });
  it("rejects duplicate stable IDs", () => {
    const input = structuredClone(seedData);
    input[1].question.options[0].id = input[0].question.options[0].id;
    expect(() => validateSeed(input)).toThrow("Duplicate seed ID");
  });
  it("rejects multiple correct answers", () => {
    const input = structuredClone(seedData);
    input[0].question.options.find((option) => !option.correct)!.correct = true;
    expect(() => validateSeed(input)).toThrow("exactly one correct");
  });
  it("rejects a question or gift belonging to an unknown author", () => {
    const input = structuredClone(seedData);
    input[0].question.authorId = "unknown";
    expect(() => validateSeed(input)).toThrow("their own question");
  });
  it("rejects questions without exactly four options", () => {
    const input = structuredClone(seedData);
    input[0].question.options.pop();
    expect(() => validateSeed(input)).toThrow();
  });
});
