import { NextResponse } from "next/server";
import { discoverStreams, getStreams, rankDiscoveredStreams } from "@/lib/streams";
import { isLeague } from "@/lib/registry";
import type { StreamLookup } from "@/lib/streams/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeam(value: unknown): value is StreamLookup["homeTeam"] {
  return isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.abbreviation === "string";
}

function isStreamLookup(value: unknown): value is StreamLookup {
  return isRecord(value) &&
    typeof value.id === "string" &&
    isLeague(value.league) &&
    (value.eventName === undefined || typeof value.eventName === "string") &&
    (value.shortName === undefined || typeof value.shortName === "string") &&
    isTeam(value.homeTeam) &&
    isTeam(value.awayTeam);
}

function progressiveStreams(game: StreamLookup, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const startedAt = performance.now();
  const controller = new AbortController();
  const workSignal = AbortSignal.any([signal, controller.signal]);
  let active = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => {
        if (!active || workSignal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        } catch {
          active = false;
        }
      };

      try {
        const discovered = await discoverStreams(game, { signal: workSignal });
        const discoveryMs = performance.now() - startedAt;
        send({ type: "discovery", streams: discovered, discoveryMs });

        const streams = await rankDiscoveredStreams(discovered, { signal: workSignal });
        send({
          type: "complete",
          streams,
          discoveryMs,
          healthMs: performance.now() - startedAt - discoveryMs,
        });
      } catch {
        if (!workSignal.aborted) {
          send({ type: "error", message: "stream lookup failed" });
        }
      } finally {
        if (active && !workSignal.aborted) {
          try {
            controller.close();
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

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isStreamLookup(body)) {
    return NextResponse.json({ streams: [] }, { status: 400 });
  }

  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    return progressiveStreams(body, request.signal);
  }

  const streams = await getStreams(body, { signal: request.signal });
  return NextResponse.json({ streams });
}
