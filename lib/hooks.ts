"use client";

import { useEffect, useMemo, useState } from "react";
import type { Stream } from "./types";
import type { StreamLookup } from "./streams/types";

interface StreamState {
  gameId: string | null;
  streams: Stream[];
  loading: boolean;
}

export function useGameStreams(game: StreamLookup | null): StreamState {
  const [state, setState] = useState<StreamState>({ gameId: null, streams: [], loading: false });
  const lookup = useMemo(
    () => game && ({
      id: game.id,
      league: game.league,
      eventName: game.eventName,
      shortName: game.shortName,
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
      game?.eventName,
      game?.shortName,
      game?.homeTeam.name,
      game?.homeTeam.abbreviation,
      game?.awayTeam.name,
      game?.awayTeam.abbreviation,
    ],
  );

  useEffect(() => {
    if (!lookup) {
      setState({ gameId: null, streams: [], loading: false });
      return;
    }
    const controller = new AbortController();
    setState({ gameId: lookup.id, streams: [], loading: true });
    fetch("/api/streams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lookup),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: { streams?: Stream[] }) => {
        if (!controller.signal.aborted) {
          setState({ gameId: lookup.id, streams: data.streams ?? [], loading: false });
        }
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch streams:", e);
        setState({ gameId: lookup.id, streams: [], loading: false });
      });
    return () => controller.abort();
  }, [lookup]);

  return state;
}
