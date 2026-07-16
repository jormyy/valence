import { NextResponse } from "next/server";
import { getAllGamesSnapshot, normalizeEspnDateParam } from "@/lib/espn";
import { attachStreamCounts, prefetchStreamCounts } from "@/lib/streams";
import { leagueDisplayForGames } from "@/lib/registry";
import type { GameWithStreams } from "@/lib/types";

function payload(games: GameWithStreams[], partial = false) {
  return {
    games,
    leagueDisplay: leagueDisplayForGames(games),
    partial,
  };
}

function progressiveGames(date: string | undefined, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const workSignal = AbortSignal.any([signal, controller.signal]);
  let active = true;

  const body = new ReadableStream<Uint8Array>({
    async start(stream) {
      const startedAt = performance.now();
      const send = (value: unknown) => {
        if (!active || workSignal.aborted) return;
        try {
          stream.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        } catch {
          active = false;
        }
      };

      try {
        const warming = prefetchStreamCounts(date, { signal: workSignal });
        const snapshot = await getAllGamesSnapshot(date, { signal: workSignal });
        const games = snapshot.games;
        const scheduleMs = performance.now() - startedAt;
        send({ type: "schedule", ...payload(games, !snapshot.complete), scheduleMs });

        await warming;
        const gamesWithStreams = await attachStreamCounts(games, date, { signal: workSignal });
        send({
          type: "complete",
          ...payload(gamesWithStreams, !snapshot.complete),
          scheduleMs,
          streamCountMs: performance.now() - startedAt - scheduleMs,
        });
      } catch {
        if (!workSignal.aborted) send({ type: "error", message: "game lookup failed" });
      } finally {
        if (active && !workSignal.aborted) {
          try {
            stream.close();
          } catch {
            active = false;
          }
        }
      }
    },
    cancel() {
      active = false;
      controller.abort();
    },
  });

  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  const date = normalizeEspnDateParam(new URL(request.url).searchParams.get("date"));
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    return progressiveGames(date, request.signal);
  }
  try {
    // Warm provider listings concurrently with the ESPN scoreboard fan-out.
    const warming = prefetchStreamCounts(date, { signal: request.signal });
    const snapshot = await getAllGamesSnapshot(date, { signal: request.signal });
    const games = snapshot.games;
    await warming;
    const gamesWithStreams = await attachStreamCounts(games, date, { signal: request.signal });
    return NextResponse.json(payload(gamesWithStreams, !snapshot.complete));
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return new Response(null, { status: 499 });
    }
    throw error;
  }
}
