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
      headers: {
        accept: "application/x-ndjson, application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(lookup),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`stream lookup failed: ${response.status}`);
        if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) {
          const data = await response.json() as { streams?: Stream[] };
          if (!controller.signal.aborted) {
            setState({ gameId: lookup.id, streams: data.streams ?? [], loading: false });
          }
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let completed = false;
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          pending += decoder.decode(chunk.value, { stream: !chunk.done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line) continue;
            const update = JSON.parse(line) as { type?: string; streams?: Stream[] };
            if ((update.type === "discovery" || update.type === "complete") && Array.isArray(update.streams)) {
              completed = update.type === "complete";
              setState({ gameId: lookup.id, streams: update.streams, loading: false });
            }
          }
          if (chunk.done) break;
        }
        if (!controller.signal.aborted && !completed) {
          setState((current) => current.gameId === lookup.id
            ? { ...current, loading: false }
            : current);
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
