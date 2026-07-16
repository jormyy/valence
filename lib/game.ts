import type { Game } from "./types";

export interface ScoreView {
  show: boolean;
  awayWin: boolean;
  homeWin: boolean;
}

export function scoreView(game: Game): ScoreView {
  const show = game.status !== "pre"
    && game.awayTeam.score != null
    && game.homeTeam.score != null;
  const away = parseInt(game.awayTeam.score ?? "0");
  const home = parseInt(game.homeTeam.score ?? "0");
  return {
    show,
    awayWin: show && away > home,
    homeWin: show && home > away,
  };
}
