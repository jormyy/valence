import Link from "next/link";
import Image from "next/image";
import type { Game } from "@/lib/types";

interface Props {
  game: Game;
  streamCount: number;
}

export default function GameCard({ game, streamCount }: Props) {
  const { homeTeam, awayTeam, status, statusDisplay, league } = game;

  const leagueLabel = league.toUpperCase();
  const isLive = status === "in";
  const isFinal = status === "post";
  const showScore = isLive || isFinal;

  const inner = (
    <>
      {/* Teams */}
      <div className="flex flex-1 flex-col gap-2">
        <TeamRow team={awayTeam} showScore={showScore} />
        <TeamRow team={homeTeam} showScore={showScore} />
      </div>

      {/* Status + meta */}
      <div className="ml-6 flex flex-col items-end gap-1.5">
        <span className={`text-xs font-medium ${isLive ? "text-red-400" : "text-white/50"}`}>
          {isLive ? "● LIVE" : statusDisplay}
        </span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/60">
          {leagueLabel}
        </span>
        {!isFinal && streamCount > 0 && (
          <span className="text-xs text-emerald-400">
            {streamCount} stream{streamCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </>
  );

  const baseClass = "flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-5 py-4";

  if (isFinal) {
    return <div className={`${baseClass} opacity-60`}>{inner}</div>;
  }

  return (
    <Link href={`/event/${game.id}`} className={`${baseClass} transition hover:border-white/20 hover:bg-white/10`}>
      {inner}
    </Link>
  );
}

function TeamRow({ team, showScore }: { team: Game["homeTeam"]; showScore: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {team.logo && (
        <Image src={team.logo} alt={team.abbreviation} width={24} height={24} className="object-contain" />
      )}
      <span className="text-sm font-medium">{team.name}</span>
      {showScore && team.score && (
        <span className="ml-auto text-sm font-bold tabular-nums">{team.score}</span>
      )}
    </div>
  );
}
