import type { RankingEntry } from "@/shared/types";

export function Ranking({ ranking, myId }: { ranking: RankingEntry[]; myId?: string }) {
  const myEntry = ranking.find((entry) => entry.participantId === myId);
  return (
    <section className="ranking-card reveal" aria-labelledby="ranking-title">
      <h2 id="ranking-title">Ranking jawaban benar</h2>
      <p className="ranking-note">Siapa yang paling perhatian diantara kita?</p>
      <ol className="ranking-list">
        {ranking.slice(0, 3).map((entry) => (
          <li
            key={entry.participantId}
            className={entry.participantId === myId ? "ranking-me" : ""}
          >
            <span className="ranking-position" aria-label={`Peringkat ${entry.rank}`}>
              {entry.rank}
            </span>
            <span className="ranking-name">
              {entry.participantName}
              {entry.participantId === myId && <small> (kamu)</small>}
            </span>
            <strong className="ranking-score">{entry.correctCount} benar</strong>
          </li>
        ))}
      </ol>
      {myEntry && (
        <div className="ranking-personal">
          <span>Posisimu</span>
          <strong>Peringkat {myEntry.rank}</strong>
          <span>{myEntry.correctCount} jawaban benar</span>
        </div>
      )}
    </section>
  );
}
