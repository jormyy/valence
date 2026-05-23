"use client";

import { useEffect, useState } from "react";
import type { Stream } from "./types";

export function useGameStreams(gameId: string | null): Stream[] {
  const [streams, setStreams] = useState<Stream[]>([]);

  useEffect(() => {
    if (!gameId) { setStreams([]); return; }
    let cancelled = false;
    fetch(`/api/streams/${gameId}`)
      .then((r) => r.json())
      .then((data: { streams?: Stream[] }) => { if (!cancelled) setStreams(data.streams ?? []); })
      .catch((e) => {
        console.error("Failed to fetch streams:", e);
        if (!cancelled) setStreams([]);
      });
    return () => { cancelled = true; };
  }, [gameId]);

  return streams;
}
