import type { Stream } from "./types";
import streamsData from "@/data/streams.json";

const streams = streamsData as unknown as Record<string, Stream[]>;

export function getStreams(gameId: string): Stream[] {
  return streams[gameId] ?? [];
}
