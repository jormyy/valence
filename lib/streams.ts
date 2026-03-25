import fs from "fs";
import path from "path";
import type { Stream } from "./types";

const STREAMS_PATH = path.join(process.cwd(), "data/streams.json");

export function getStreams(gameId: string): Stream[] {
  try {
    const raw = fs.readFileSync(STREAMS_PATH, "utf-8");
    const { _comment: _, _date: __, ...data } = JSON.parse(raw) as Record<string, Stream[]>;
    return data[gameId] ?? [];
  } catch {
    return [];
  }
}
