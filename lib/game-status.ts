import type { Game } from "./types";

export const STATUS_ORDER: Readonly<Record<Game["status"], number>> = {
  in: 0,
  pre: 1,
  post: 2,
};
