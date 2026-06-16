"use client";

import { useEffect, useMemo, useState } from "react";
import type { Stream } from "./types";
import type { StreamLookup } from "./streams/types";

export function useGameStreams(game: StreamLookup | null): Stream[] {
  const [streams, setStreams] = useState<Stream[]>([]);
  const lookup = useMemo(
    () => game && ({
      id: game.id,
      league: game.league,
      homeTeam: {
        name: game.homeTeam.name,
        abbreviation: game.homeTeam.abbreviation,
      },
      awayTeam: {
        name: game.awayTeam.name,
        abbreviation: game.awayTeam.abbreviation,
      },
    }),
    [
      game?.id,
      game?.league,
      game?.homeTeam.name,
      game?.homeTeam.abbreviation,
      game?.awayTeam.name,
      game?.awayTeam.abbreviation,
    ],
  );

  useEffect(() => {
    if (!lookup) { setStreams([]); return; }
    const controller = new AbortController();
    fetch("/api/streams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lookup),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { streams?: Stream[] }) => setStreams(data.streams ?? []))
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch streams:", e);
        setStreams([]);
      });
    return () => controller.abort();
  }, [lookup]);

  return streams;
}
