"use client";

import { useState } from "react";
import type { HistoryRound } from "@/shared/types";
import { api } from "./use-game";

export function HostHistory() {
  const [rounds, setRounds] = useState<HistoryRound[]>([]);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setOpened(true);
    setBusy(true);
    setError("");
    try {
      setRounds((await api<{ rounds: HistoryRound[] }>("host/history")).rounds);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Arsip belum dapat dimuat.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="answer-log">
      <div className="section-heading">
        <h3>Arsip ronde</h3>
        <button className="text-button" onClick={() => void load()} disabled={busy}>
          {busy ? "Memuat..." : opened ? "Perbarui arsip" : "Buka arsip"}
        </button>
      </div>
      <p className="muted">
        Hasil otomatis terbuka setelah ronde selesai. Kunci ronde aktif tidak ditampilkan.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {opened && !busy && !rounds.length && <p className="muted">Belum ada hasil yang dibuka.</p>}
      {rounds.map((round) => (
        <details className="history-round" key={round.id}>
          <summary>
            Ronde {String(round.number).padStart(2, "0")} &middot; {round.authorName}
            <span>{round.winnerName ?? "Tanpa pemenang"}</span>
          </summary>
          <h4>{round.text}</h4>
          <p className="muted">Jawaban benar: {round.correctLabel}</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Peserta</th>
                  <th>Pilihan</th>
                  <th>Hasil</th>
                  <th>Hak hadiah saat ronde</th>
                  <th>Diterima server</th>
                </tr>
              </thead>
              <tbody>
                {round.logs.map((log) => (
                  <tr key={log.participantId}>
                    <td>{log.participantName}</td>
                    <td>{log.optionLabel}</td>
                    <td>{log.correct ? "Benar" : "Salah"}</td>
                    <td>{log.eligible ? "Eligible" : "Sudah menang"}</td>
                    <td>
                      {new Date(log.receivedAt).toLocaleTimeString("id-ID", {
                        hour12: false,
                        fractionalSecondDigits: 3,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!round.logs.length && <p className="muted">Tidak ada jawaban.</p>}
          </div>
        </details>
      ))}
    </section>
  );
}
