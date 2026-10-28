"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { GameState, GiftAssignment } from "@/shared/types";
import { ArrowIcon, BrandMark, GiftIcon } from "./icons";
import { api, useGame } from "./use-game";
import { HostHistory } from "./host-history";
import { Ranking } from "./ranking";
import { PlayerCelebration } from "./player-celebration";

function Shell({
  host,
  connection,
  children,
}: {
  host: boolean;
  connection: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`app-shell ${host ? "host-shell" : "player-shell"}`}>
      <header className="topbar">
        <Link className="brand" href="/">
          <BrandMark />
        </Link>
        <div className="topbar-right">
          <span className={`connection ${connection}`} role="status">
            <i />
            {connection === "online"
              ? "Terhubung"
              : connection === "offline"
                ? "Menghubungkan ulang"
                : "Menghubungkan"}
          </span>
          <span className="mode-label">{host ? "HOST DESK" : "PLAY TOGETHER"}</span>
        </div>
      </header>
      {children}
      <footer className="footer">
        <span>Made with ❤️ by AI JALA.</span>
        <span>Maguwonian Together Stronk</span>
      </footer>
    </div>
  );
}

function GiftCard({ gift }: { gift: GiftAssignment }) {
  return (
    <section className="gift-card reveal">
      <div className="gift-stamp">
        <GiftIcon />
      </div>
      <div>
        <h3>Kamu dapet kado dari {gift.ownerName}</h3>
        <p>Tagih orangnya ya!</p>
      </div>
      <span className="status-tag">Hadiah diterima</span>
    </section>
  );
}

function People({ state, host }: { state: GameState; host: boolean }) {
  return (
    <section className="people-panel">
      <div className="section-heading">
        <h3>Member</h3>
        <span>{state.participants.filter((p) => p.online).length}/19 online</span>
      </div>
      <div className="people-grid">
        {state.participants.map((person, index) => (
          <div className={`person ${person.id === state.me?.id ? "is-you" : ""}`} key={person.id}>
            <span className={`avatar color-${index % 6}`}>
              {String(index + 1).padStart(2, "0")}
              <i className={person.online ? "online" : ""} />
            </span>
            <div>
              <span className="person-name">
                {person.name}
                {person.id === state.me?.id ? " (kamu)" : ""}
              </span>
              <small>
                {person.hasGift
                  ? "Hadiah diterima"
                  : host && person.submitted && state.status === "question_active"
                    ? "Jawaban masuk"
                    : person.online
                      ? "Siap bermain"
                      : "Belum terhubung"}
              </small>
            </div>
            {person.hasGift && <span aria-label="Sudah mendapat hadiah">🎁</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Ledger({ state }: { state: GameState }) {
  return (
    <section className="ledger">
      <div className="section-heading">
        <h3>Tukar Kado</h3>
        <span>{state.ledger.length}/19 dibagikan</span>
      </div>
      {!state.ledger.length ? (
        <p className="muted">Setiap hadiah menunggu pemilik barunya.</p>
      ) : (
        <ol>
          {state.ledger.map((gift) => (
            <li key={gift.giftId}>
              <span className="ledger-number">🎁</span>
              <div>
                <strong>Kado buat {gift.recipientName}</strong>
                <small>
                  dikasih sama <strong>{gift.ownerName}</strong>
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function GameScreen({ host = false }: { host?: boolean }) {
  const { state, connection, error: syncError, authRequired, seconds, reload } = useGame(host);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingOption, setPendingOption] = useState<string | null>(null);
  const [ack, setAck] = useState<{ roundId: string; optionId: string } | null>(null);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("host/login", { password });
      setPassword("");
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gagal masuk.");
    } finally {
      setBusy(false);
    }
  };
  const action = async (name: string) => {
    if (!state || busy || connection !== "online") return;
    setBusy(true);
    setError("");
    try {
      await api("host/action", { action: name, version: state.version });
      reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Aksi tidak berhasil.");
      reload();
    } finally {
      setBusy(false);
    }
  };
  const answer = async (optionId: string) => {
    if (!state?.round || busy || connection !== "online") return;
    setBusy(true);
    setPendingOption(optionId);
    setError("");
    const roundId = state.round.id;
    try {
      await api("answer", { roundId, optionId });
      setAck({ roundId, optionId });
      reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Jawaban belum terkonfirmasi. Periksa koneksi.",
      );
      reload();
    } finally {
      setBusy(false);
      setPendingOption(null);
    }
  };

  if (authRequired)
    return (
      <Shell host={host} connection={connection}>
        <main className="auth-page">
          <div className="auth-art">
            <GiftIcon />
          </div>
          <span className="eyebrow">{host ? "THE HOST DESK" : "WHERE'S UR CODE?"}</span>
          <h1>{host ? "Bawa teman\nlebih dekat." : "Invitation Codenya Mana Wok?"}</h1>
          {host ? (
            <form className="login-form" onSubmit={login}>
              <label htmlFor="password">Kata sandi host</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={256}
              />
              <button className="button primary" disabled={busy}>
                {busy ? "Memeriksa..." : "Masuk sebagai host"}
                <ArrowIcon />
              </button>
              <p className="muted">Kontrol game hanya tersedia untuk host.</p>
            </form>
          ) : (
            <>
              <p>
                Untuk bermain, buka link undangan pribadi yang dibagikan host. Sesi kamu mungkin
                sudah berakhir.
              </p>
              <Link className="button primary" href="/join">
                Periksa undangan
                <ArrowIcon />
              </Link>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </main>
      </Shell>
    );

  if (!state)
    return (
      <Shell host={host} connection={connection}>
        <main className="auth-page">
          <span className="loading-mark" aria-hidden="true">
            ✨
          </span>
          <h1>{syncError ? "Sebentar,\nkita sambung lagi." : "Menyiapkan\nmeja kita."}</h1>
          <p role="status">{syncError || "Memuat status dari server..."}</p>
          <button className="button secondary" onClick={reload}>
            Coba hubungkan
          </button>
        </main>
      </Shell>
    );

  const round = state.round;
  const submitted =
    state.submission ??
    (ack && ack.roundId === round?.id ? { optionId: ack.optionId, receivedAt: "" } : null);
  const isAuthor = state.me?.id === round?.authorId;
  const isWinner = !!round?.winnerId && round.winnerId === state.me?.id;
  const winner = state.participants.find((p) => p.id === round?.winnerId);
  const disabled = busy || connection !== "online";
  const active = state.status === "question_active";
  const intermission = state.intermissionEndsAt !== null;
  const showRound = round && ["question_active", "result_revealed"].includes(state.status);
  const hostControl = !state.initialized
    ? ["initialize", "Siapkan & acak game"]
    : state.status === "lobby"
      ? ["start", state.roundNumber ? "Mulai ronde berikutnya" : "Mulai ronde pertama"]
      : state.autoMode
        ? null
        : state.status === "question_active"
          ? ["close", "Tutup ronde sekarang"]
          : state.status === "result_revealed"
            ? [
                "advance",
                state.roundNumber === 19 ? "Lanjut ke final gacha" : "Lanjut ke ronde berikutnya",
              ]
            : state.status === "final_gacha"
              ? ["gacha", "Bagikan hadiah tersisa"]
              : null;

  return (
    <Shell host={host} connection={connection}>
      {!host && <PlayerCelebration state={state} />}
      <main className="game-layout">
        <div className="game-main">
          <div className="welcome-line">
            <div>
              <span className="eyebrow">
                {host ? "MAKE A LITTLE MAGIC" : `HEY, ${state.me?.name.toUpperCase()}`}
              </span>
              <h1>
                {state.status === "game_complete"
                  ? "Game Selesai!"
                  : state.status === "lobby"
                    ? "Nunggu semua siap..."
                    : state.status === "final_gacha"
                      ? "Kejutan\nterakhir kita."
                      : "Seberapa dekat\nkamu kenal doi?"}
              </h1>
            </div>
            <span className="event-badge">
              THE
              <br />
              BONDING
              <br />
              <strong>QUIZ</strong>
            </span>
          </div>
          <div className="progress-line">
            <span>
              {state.status === "game_complete"
                ? "GAME COMPLETE"
                : `RONDE ${String(state.roundNumber).padStart(2, "0")} / 19`}
            </span>
            <div className="progress-track">
              <i style={{ width: `${(state.roundNumber / 19) * 100}%` }} />
            </div>
            <span>{state.ledger.length} hadiah</span>
          </div>
          {(error || connection === "offline") && (
            <div className="error" role="alert">
              {error ||
                "Koneksi terputus. Status terakhir ditampilkan; jawaban dan kontrol dinonaktifkan sampai terhubung kembali."}
              <button className="text-button" onClick={reload}>
                Periksa ulang
              </button>
            </div>
          )}

          {state.status === "lobby" && (
            <section className="lobby-card">
              <div>
                <h2>
                  {state.roundNumber
                    ? "Cerita berikutnya\nsegera dimulai."
                    : "Ayo temenya disuru siap-siaapp!"}
                </h2>
                <p>
                  {host
                    ? "Pastikan teman-teman sudah bergabung. Kamu yang menentukan kapan keseruannya dimulai."
                    : state.autoMode
                      ? "Tunggu host memulai. Setelah itu, 15 detik menjawab dan 10 detik jeda hasil, otomatis sampai selesai."
                      : "Kamu sudah masuk. Tunggu host memulai ronde, lalu pilih jawaban secepat mungkin."}
                </p>
                <div className="mini-rules">
                  <span>19 teman</span>
                  <span>15 detik</span>
                  {state.autoMode && <span>10 detik jeda</span>}
                  <span>1 hadiah / orang</span>
                </div>
              </div>
              <GiftIcon className="lobby-gift" />
            </section>
          )}

          {host && state.status === "lobby" && state.roundNumber === 0 && (
            <section className="mode-card">
              <label className="mode-choice">
                <input
                  type="checkbox"
                  checked={state.autoMode}
                  disabled={disabled}
                  onChange={(event) => void action(event.target.checked ? "auto_on" : "auto_off")}
                />
                <span>Full Auto</span>
              </label>
              <p>
                {state.autoMode
                  ? "Mulai sekali: 15 detik menjawab, 10 detik jeda, lalu ronde berikutnya dan final gacha otomatis."
                  : "Mode manual: hasil tetap otomatis, tetapi kamu memberi cue untuk setiap ronde."}{" "}
                Mode dipilih sebelum ronde pertama dan tidak berubah selama game.
              </p>
            </section>
          )}

          {intermission && (
            <section className="intermission-card">
              <div>
                <h3>
                  {state.roundNumber === 19
                    ? "Hadiah terakhir sebentar lagi..."
                    : "Siap untuk ronde berikutnya?"}
                </h3>
                <p>
                  {state.roundNumber === 19
                    ? "Final gacha dan ranking terbuka otomatis setelah jeda."
                    : "Lihat hasilmu. Ronde berikutnya dimulai otomatis setelah jeda."}
                </p>
              </div>
              <div
                className="timer"
                role="timer"
                aria-label={`${seconds} detik menuju ${state.roundNumber === 19 ? "final gacha" : "ronde berikutnya"}`}
              >
                <strong>{seconds}</strong>
                <span>DETIK</span>
              </div>
            </section>
          )}

          {showRound && (
            <section
              className={`question-card ${round.revealed ? "result-card" : ""}`}
              key={round.id}
            >
              <div className="question-top">
                <span className="author-chip">
                  <span className="mini-avatar">{round.authorId.slice(1)}</span>
                  <span>
                    Tentang <strong>{round.authorName}</strong>
                  </span>
                </span>
                <div
                  className={`timer ${seconds <= 5 && active ? "urgent" : ""}`}
                  aria-label={`${active ? seconds : 0} detik menjawab tersisa`}
                >
                  <strong>{active ? seconds : "--"}</strong>
                  <span>DETIK</span>
                </div>
              </div>
              <h2>{round.text}</h2>
              <p className="question-help">
                {round.revealed
                  ? "Jawaban sudah dibuka. Ini cerita yang sebenarnya."
                  : isAuthor && !host
                    ? "Ini ceritamu! Kamu menonton ronde ini, bukan menjawab."
                    : submitted
                      ? "Jawabanmu sudah diterima server. Tunggu hasilnya."
                      : active
                        ? "Pilih satu. Jawaban yang sudah masuk tidak bisa diubah."
                        : "Waktu habis. Hasil akan tampil otomatis."}
              </p>
              <div className="answer-grid">
                {round.options.map((option, index) => {
                  const selected = submitted?.optionId === option.id;
                  const correct = round.revealed && option.id === round.correctOptionId;
                  const wrong = round.revealed && selected && !correct;
                  return (
                    <button
                      key={option.id}
                      className={`answer-option option-${index} ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "incorrect" : ""}`}
                      onClick={() => void answer(option.id)}
                      disabled={host || disabled || !active || !!submitted || isAuthor}
                      aria-pressed={selected}
                    >
                      <span className="option-letter">{"ABCD"[index]}</span>
                      <span>{option.label}</span>
                      <span className="option-status">
                        {pendingOption === option.id
                          ? "Mengirim"
                          : correct
                            ? "Benar"
                            : selected
                              ? "Pilihanmu"
                              : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="round-status" role="status">
                <span>
                  <i className={submitted ? "received" : ""} />
                  {round.revealed
                    ? submitted
                      ? state.submission?.correct
                        ? "Jawabanmu benar"
                        : "Belum tepat kali ini"
                      : "Kamu tidak menjawab ronde ini"
                    : submitted
                      ? "Jawaban tersimpan"
                      : isAuthor && !host
                        ? "Kamu penulis pertanyaan"
                        : active
                          ? "Jawaban masih dibuka"
                          : "Jawaban ditutup"}
                </span>
                <span>{round.submissionCount}/18 jawaban</span>
              </div>
              {round.revealed && (
                <div className={`winner-reveal ${isWinner ? "you-won" : ""}`}>
                  <span className="winner-emoji" aria-hidden="true">
                    {winner ? "🎉" : "😭"}
                  </span>
                  <div>
                    <span className="eyebrow">
                      {winner ? "FASTEST ELIGIBLE FRIEND" : "SAVED FOR THE FINAL SURPRISE"}
                    </span>
                    <h3>
                      {isWinner
                        ? "Kamu menang!"
                        : winner
                          ? `${winner.name} menang!`
                          : "Belum ada pemenang."}
                    </h3>
                    <p>
                      {winner
                        ? "Jawaban benar tercepat yang masih berhak menerima hadiah."
                        : "Hadiah ini masuk ke gacha final. Tetap ada kejutan untuk semua."}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {state.status === "final_gacha" && (
            <section className="gacha-card">
              <GiftIcon />
              <span className="eyebrow">A LITTLE LUCK, A LOT OF LOVE</span>
              <h2>
                {19 - state.ledger.length} hadiah.
                <br />
                {19 - state.ledger.length} teman beruntung.
              </h2>
              <p>
                {host
                  ? "Sistem akan memasangkan hadiah tersisa secara acak tanpa pengulangan, lalu menyimpan semuanya sebelum menampilkan hasil."
                  : "Tidak ada yang pulang tanpa kejutan. Tunggu host membagikan hadiah tersisa."}
              </p>
            </section>
          )}
          {state.status === "game_complete" && (
            <section className="complete-card reveal">
              <span className="complete-emoji" aria-hidden="true">
                🎉
              </span>
              <span className="eyebrow">THAT'S A WRAP, GUYS!</span>
              <h2>{!host && state.myGift && `Kamu dapat kado dari ${state.myGift.ownerName}!`}</h2>
              <p>
                Semua hadiah sudah punya pemilik. Cek hasil gachanya di bawah. Terima kasih sudah
                main bareng, semoga makin dekat sama teman-temanmu!
              </p>
            </section>
          )}

          {state.status === "game_complete" && state.ranking && (
            <Ranking ranking={state.ranking} myId={state.me?.id} />
          )}

          {host && (hostControl || (state.autoMode && state.status !== "game_complete")) && (
            <section className="host-controls">
              <div>
                <span className="eyebrow">{state.autoMode ? "FULL AUTO" : "YOU SET THE PACE"}</span>
                <p>
                  {state.autoMode
                    ? "Host memberi cue pertama. Setelah dimulai, sistem menjalankan 15 detik menjawab dan 10 detik jeda sampai hadiah terakhir dibagikan."
                    : state.status === "question_active"
                      ? "Hasil otomatis terbuka saat waktu habis atau 18 jawaban masuk. Menutup ronde lebih awal juga langsung membuka hasil."
                      : state.status === "result_revealed"
                        ? "Hasil sudah terbuka otomatis. Soal berikutnya dimulai hanya saat kamu memberi cue."
                        : "Kontrol divalidasi server. Aksi dari status lama tidak akan mengubah ronde baru."}
                </p>
              </div>
              {hostControl && (
                <button
                  className="button primary"
                  onClick={() => void action(hostControl[0])}
                  disabled={disabled}
                >
                  {busy ? "Memproses..." : hostControl[1]}
                  <ArrowIcon />
                </button>
              )}
            </section>
          )}
          {!host && state.myGift && state.status !== "game_complete" && (
            <GiftCard gift={state.myGift} />
          )}
          {host && round?.revealed && round.logs && state.status === "result_revealed" && (
            <section className="answer-log">
              <div className="section-heading">
                <h3>Catatan jawaban</h3>
                <span>Urutan diterima server</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Peserta</th>
                      <th>Pilihan</th>
                      <th>Hasil</th>
                      <th>Hak hadiah</th>
                      <th>Diterima</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.logs.map((log) => (
                      <tr key={log.participantId}>
                        <td>{log.participantName}</td>
                        <td>{round.options.find((o) => o.id === log.optionId)?.label}</td>
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
                {!round.logs.length && <p className="muted">Tidak ada jawaban pada ronde ini.</p>}
              </div>
            </section>
          )}
          {host && <Ledger state={state} />}
          {host && <HostHistory />}
        </div>
        <aside className="game-sidebar">
          {state.status !== "game_complete" && <People state={state} host={host} />}
        </aside>
      </main>
    </Shell>
  );
}
