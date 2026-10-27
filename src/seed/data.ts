import { z } from "zod";

// Private event content from the supplied CSV; gift contents remain unknown.
const questions = [
  [
    "Gita",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku takut sama…",
    ["Anjing", "Kucing", "Ular", "Kecoa"],
    1,
  ],
  [
    "Farid Inawan",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku…",
    ["Voters Anies", "Gamer", "Wibu", "Fans bola"],
    2,
  ],
  [
    "Dika",
    "Kalau kamu kenal aku, kamu pasti tahu kalau tanda lahirku ada di…",
    ["Tangan kanan", "Tangan kiri", "Leher", "Lutut kanan"],
    1,
  ],
  [
    "Dhama",
    "Kalau kamu kenal aku, kamu pasti tahu kalau ODGJ versiku adalah…",
    [
      "Orang Doyan Game Jepang",
      "Orang dengan Gangguan Jawa",
      "Orang Doyan Gonta-ganti Jaket",
      "Orang Doyan Gowes Jauh",
    ],
    3,
  ],
  [
    "Regina",
    "Kalau kamu kenal aku, kamu pasti tahu kalau item fasyun favoritku adalah…",
    ["Jaket", "Sepatu", "Baju", "Dress"],
    1,
  ],
  [
    "Rio",
    "Kalau kamu kenal aku, kamu pasti tahu kalau saat perjalanan aku gampang…",
    ["Lapar", "Pusing", "Ngantuk", "Bosan"],
    2,
  ],
  [
    "Vania",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku suka mendengarkan…",
    ["K-Pop", "Rock", "Jazz", "Hip-hop"],
    3,
  ],
  [
    "Hafizal",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku susah tidur tanpa suara…",
    ["Musik", "Orang ngobrol", "Hujan", "Televisi"],
    1,
  ],
  [
    "Gina Ho",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku…",
    [
      "Gak suka ngemil",
      "Suka marah marah",
      "Selalu memikirkan sesuatu",
      "Kalo ngetik gapernah typo",
    ],
    2,
  ],
  [
    "Jihad",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku suka meracik…",
    ["Resep kopi", "Resep teh", "Resep jamu", "Resep jus"],
    0,
  ],
  [
    "Farras",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku berusaha jadi…",
    ["Lead Designer", "Normal", "Pria Solo", "Top spender token"],
    3,
  ],
  [
    "Nadia",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku suka kesal kalau…",
    ["Rapat terlambat", "Meja kotor", "Suasana berisik", "Ruangan kotor"],
    1,
  ],
  [
    "Farid Pangari",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku alergi…",
    ["Kepiting", "Cumi-cumi", "Udang", "Kerang"],
    2,
  ],
  [
    "DhanP",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku…",
    ["Wibu", "Swifties", "Gamer", "Normal"],
    0,
  ],
  [
    "Annisa",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku suka…",
    ["Hindia dan Feast", "Tulus dan Maliq", "Nadin dan Sal Priadi", "Raisa dan Isyana"],
    1,
  ],
  [
    "Gilang",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku bisa menggerakkan…",
    ["Alis", "Hidung", "Telinga", "Jari kaki"],
    2,
  ],
  [
    "Dany",
    "Kalau kamu kenal aku, kamu pasti tahu kalau sampai umur 16 tahun aku atlet junior…",
    ["Padel", "Badminton", "Basket", "Tenis"],
    3,
  ],
  [
    "Ari",
    "Kalau kamu kenal aku, kamu pasti tahu kalau aku suka dimarahin…",
    ["Gen Milenial", "Gen Z", "Gen X", "Baby Boomers"],
    0,
  ],
  [
    "Syauqy",
    "Kalau kamu kenal aku, kamu pasti tahu kalau bulan ini aku menyelesaikan…",
    ["Half marathon", "Lari 10K", "Full marathon", "Ultra marathon"],
    2,
  ],
  [
    "Khasin",
    "Kalau kamu kenal aku, kamu pasti tahu kalau banyak yang bilang aku mirip…",
    ["Ariel Noah", "Rian D’Masiv", "Pasha Ungu", "Virgoun"],
    1,
  ],
] as const;

export const seedData = questions.map(([name, text, choices, correct], index) => {
  const suffix = String(index + 1).padStart(2, "0");
  return {
    id: `p${suffix}`,
    name: String(name),
    question: {
      id: `q${suffix}`,
      authorId: `p${suffix}`,
      text,
      options: choices.map((label, position) => ({
        id: `q${suffix}-${position}`,
        label,
        correct: position === correct,
      })),
    },
    gift: {
      id: `g${suffix}`,
      ownerId: `p${suffix}`,
      name: "Hadiah kejutan",
      description: "Isi kado dirahasiakan",
    },
  };
});

const id = z.string().min(1).max(64);
const entry = z.object({
  id,
  name: z.string().min(1).max(80),
  question: z.object({
    id,
    authorId: id,
    text: z.string().min(1).max(500),
    options: z
      .array(z.object({ id, label: z.string().min(1).max(200), correct: z.boolean() }))
      .length(4),
  }),
  gift: z.object({
    id,
    ownerId: id,
    name: z.string().min(1).max(120),
    description: z.string().max(500),
  }),
});

export type SeedEntry = z.infer<typeof entry>;

export function validateSeed(input: unknown): SeedEntry[] {
  const entries = z.array(entry).length(20).parse(input);
  const identifiers = new Set<string>();
  for (const person of entries) {
    if (person.question.authorId !== person.id || person.gift.ownerId !== person.id)
      throw new Error("Each participant must author their own question and own one gift.");
    if (person.question.options.filter((option) => option.correct).length !== 1)
      throw new Error("Every question must have exactly one correct option.");
    for (const value of [
      person.id,
      person.question.id,
      person.gift.id,
      ...person.question.options.map((option) => option.id),
    ]) {
      if (identifiers.has(value)) throw new Error(`Duplicate seed ID: ${value}`);
      identifiers.add(value);
    }
  }
  return entries;
}
