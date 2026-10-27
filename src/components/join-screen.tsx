"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "./use-game";
import { BrandMark, GiftIcon } from "./icons";

export function JoinScreen() {
  const started = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    const exchange = async () => {
      try {
        if (token) await api("invite", { token });
        else await api("state");
        window.location.replace("/play");
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Undangan tidak dapat diperiksa.");
        setBusy(false);
      }
    };
    void exchange();
  }, []);
  return (
    <main className="join-page">
      <Link className="brand" href="/">
        <BrandMark />
      </Link>
      <div className="join-content">
        <GiftIcon />
        <h1>{busy ? "Membuka\nundanganmu." : "Sudah siap\nuntuk main?"}</h1>
        <p role={busy ? "status" : "alert"}>
          {busy ? "Memeriksa undangan pribadi dengan server..." : error}
        </p>
        {!busy && (
          <>
            <p className="muted">
              Buka ulang link undangan asli untuk mencoba lagi. Jika tetap gagal, minta host
              memeriksa undanganmu.
            </p>
            <Link href="/" className="button secondary">
              Kembali ke beranda
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
