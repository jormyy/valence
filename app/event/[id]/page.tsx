import { notFound } from "next/navigation";
import Image from "next/image";
import { getAllGames } from "@/lib/espn";
import { getStreams } from "@/lib/streams";
import StreamList from "@/components/StreamList";

export const revalidate = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const games = await getAllGames();
  const game = games.find((g) => g.id === id);

  if (!game) notFound();

  const streams = getStreams(game.id);
  const leagueLabel = game.league.toUpperCase();
  const isLive = game.status === "in";

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* Player + stream list */}
      <div className="flex flex-1 flex-col gap-4">
        {/* Player area */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          {streams.length > 0 ? (
            <StreamList streams={streams} />
          ) : (
            <div className="flex h-full items-center justify-center text-white/30">
              No streams available yet
            </div>
          )}
        </div>
      </div>

      {/* Game info sidebar */}
      <div className="w-full lg:w-72">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">
            {leagueLabel}
          </div>

          {/* Scoreboard */}
          <div className="mt-4 flex flex-col gap-3">
            {[game.awayTeam, game.homeTeam].map((team) => (
              <div key={team.abbreviation} className="flex items-center gap-3">
                {team.logo && (
                  <Image
                    src={team.logo}
                    alt={team.abbreviation}
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                )}
                <span className="flex-1 text-sm font-medium">{team.name}</span>
                {(isLive || game.status === "post") && team.score && (
                  <span className="text-lg font-bold tabular-nums">
                    {team.score}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div
            className={`mt-4 text-sm ${
              isLive ? "font-semibold text-red-400" : "text-white/50"
            }`}
          >
            {isLive ? `● ${game.statusDisplay}` : game.statusDisplay}
          </div>
        </div>
      </div>
    </div>
  );
}
