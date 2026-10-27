export type GameStatus =
  "lobby" | "question_active" | "result_revealed" | "final_gacha" | "game_complete";
export type Participant = {
  id: string;
  name: string;
  online: boolean;
  submitted: boolean;
  hasGift: boolean;
};
export type GiftAssignment = {
  giftId: string;
  ownerId: string;
  ownerName: string;
  recipientId: string;
  recipientName: string;
  source: "round" | "gacha";
};
export type HistoryRound = {
  id: string;
  number: number;
  text: string;
  authorName: string;
  correctLabel: string;
  winnerName: string | null;
  logs: {
    participantId: string;
    participantName: string;
    optionLabel: string;
    receivedAt: string;
    correct: boolean;
    eligible: boolean;
  }[];
};
export type RankingEntry = {
  participantId: string;
  participantName: string;
  correctCount: number;
  rank: number;
};
export type GameState = {
  status: GameStatus;
  initialized: boolean;
  autoMode: boolean;
  intermissionEndsAt: string | null;
  version: number;
  roundNumber: number;
  serverNow: string;
  participants: Participant[];
  me: { id: string; name: string } | null;
  round: {
    id: string;
    number: number;
    text: string;
    authorId: string;
    authorName: string;
    options: { id: string; label: string; position: number }[];
    startedAt: string;
    deadline: string;
    closed: boolean;
    revealed: boolean;
    submissionCount: number;
    correctOptionId?: string;
    winnerId?: string | null;
    logs?: {
      participantId: string;
      participantName: string;
      optionId: string;
      receivedAt: string;
      correct: boolean;
      eligible: boolean;
    }[];
  } | null;
  submission: { optionId: string; receivedAt: string; correct?: boolean } | null;
  myGift: GiftAssignment | null;
  ranking: RankingEntry[] | null;
  ledger: GiftAssignment[];
};
