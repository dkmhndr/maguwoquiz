"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@/shared/types";

const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error?.message ?? "Server tidak dapat dihubungi.",
      response.status,
      data.error?.code ?? "UNKNOWN",
    );
  return data as T;
}

export function useGame(host: boolean) {
  const [state, setState] = useState<GameState | null>(null);
  const [connection, setConnection] = useState<"connecting" | "online" | "offline">("connecting");
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(15);
  const pollRef = useRef<() => void>(() => {});
  const remainingRef = useRef<{ remaining: number; at: number } | null>(null);
  const reload = useCallback(() => pollRef.current(), []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      let interval = 2000;
      try {
        const data = await api<GameState>(host ? "host/state" : "state");
        if (!active) return;
        setState(data);
        setConnection("online");
        setAuthRequired(false);
        setError("");
        const deadline = data.intermissionEndsAt ?? data.round?.deadline;
        remainingRef.current = deadline
          ? {
              remaining: Date.parse(deadline) - Date.parse(data.serverNow),
              at: performance.now(),
            }
          : null;
        interval = data.status === "question_active" || data.intermissionEndsAt ? 1000 : 2000;
      } catch (failure) {
        if (!active) return;
        if (failure instanceof ApiError && [401, 403].includes(failure.status)) {
          setAuthRequired(true);
          setState(null);
          setConnection("connecting");
        } else {
          setConnection("offline");
          setError(failure instanceof Error ? failure.message : "Koneksi terputus.");
        }
        interval = 3000;
      } finally {
        inFlight = false;
        if (active) timer = setTimeout(poll, interval);
      }
    };
    pollRef.current = () => {
      void poll();
    };
    const wake = () => {
      void poll();
    };
    const disconnect = () => {
      setConnection("offline");
    };
    void poll();
    window.addEventListener("online", wake);
    window.addEventListener("offline", disconnect);
    window.addEventListener("focus", wake);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", disconnect);
      window.removeEventListener("focus", wake);
    };
  }, [host]);

  useEffect(() => {
    const tick = () => {
      const reference = remainingRef.current;
      setSeconds(
        reference
          ? Math.max(
              0,
              Math.ceil((reference.remaining - (performance.now() - reference.at)) / 1000),
            )
          : 15,
      );
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [state?.round?.id, state?.intermissionEndsAt]);

  return { state, connection, error, authRequired, seconds, reload };
}
