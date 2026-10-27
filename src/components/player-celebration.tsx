"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameState, GiftAssignment } from "@/shared/types";

type Celebration = { id: string; answer: boolean | null; gift: GiftAssignment | null };

function Confetti() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3600);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="confetti-layer" aria-hidden="true">
      {Array.from({ length: 56 }, (_, index) => (
        <i
          className="confetti-piece"
          key={index}
          style={
            {
              left: `${(index * 17) % 100}%`,
              "--drift": `${((index * 43) % 240) - 120}px`,
              "--spin": `${index % 2 ? 720 : -720}deg`,
              animationDelay: `${(index % 8) * 0.07}s`,
              animationDuration: `${2.3 + (index % 5) * 0.16}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function CelebrationDialog({
  celebration,
  dismiss,
}: {
  celebration: Celebration;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="celebration-dialog"
      aria-labelledby="celebration-title"
      aria-describedby="celebration-message"
      onClose={dismiss}
    >
      {(celebration.answer === true || celebration.gift) && <Confetti />}
      <div className="celebration-content">
        <div className="celebration-art">
          <span aria-hidden="true">
            {celebration.gift ? "🎁" : celebration.answer ? "🎉" : "😹"}
          </span>
        </div>
        <h2 id="celebration-title">
          {celebration.answer === true
            ? celebration.gift
              ? "Ciee dapet kado! 🎁"
              : "Jawabanmu benar!"
            : celebration.answer === false
              ? "Yah, jawabanmu belum tepat."
              : "Kamu mendapat kado!"}
        </h2>
        <div id="celebration-message">
          {celebration.answer === true && <p>Kamu tahu cerita temanmu. Jawabanmu tepat!</p>}
          {celebration.answer === false && (
            <p>Belum benar kali ini. Yuk, coba lagi di ronde berikutnya!</p>
          )}
          {celebration.gift && (
            <div className="celebration-gift">
              <strong>Kado dari {celebration.gift.ownerName}</strong>
              <p>Sudah menjadi milikmu. Isinya tetap rahasia!</p>
            </div>
          )}
        </div>
        <button className="button primary" onClick={() => dialog.current?.close()} autoFocus>
          Lanjut bermain
        </button>
      </div>
    </dialog>
  );
}

export function PlayerCelebration({ state }: { state: GameState }) {
  const seen = useRef(new Set<string>());
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  useEffect(() => {
    if (!state.me || state.status === "question_active") {
      setCelebration(null);
      return;
    }
    const fresh = (key: string) => {
      if (seen.current.has(key)) return false;
      try {
        if (sessionStorage.getItem(key)) return false;
      } catch {
        // Browser storage may be disabled; the in-memory guard still prevents polling repeats.
      }
      return true;
    };
    const answerKey = `bq-celebration:${state.me.id}:answer:${state.round?.id}`;
    const giftKey = `bq-celebration:${state.me.id}:gift:${state.myGift?.giftId}`;
    const answer =
      state.round?.revealed && typeof state.submission?.correct === "boolean" && fresh(answerKey)
        ? state.submission.correct
        : null;
    const gift = state.myGift?.recipientId === state.me.id && fresh(giftKey) ? state.myGift : null;
    if (answer === null && !gift) return;
    const keys = [...(answer !== null ? [answerKey] : []), ...(gift ? [giftKey] : [])];
    for (const key of keys) {
      seen.current.add(key);
      try {
        sessionStorage.setItem(key, "seen");
      } catch {
        // Celebration still works without browser storage.
      }
    }
    setCelebration({ id: keys.join("|"), answer, gift });
  }, [state]);

  return celebration ? (
    <CelebrationDialog
      key={celebration.id}
      celebration={celebration}
      dismiss={() => setCelebration(null)}
    />
  ) : null;
}
