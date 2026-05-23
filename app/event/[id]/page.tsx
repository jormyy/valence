import { notFound } from "next/navigation";
import { getAllGames } from "@/lib/espn";
import { getStreams } from "@/lib/streams";
import { LEAGUE_BY_ID } from "@/lib/metadata";
import { formatTimePT } from "@/lib/espn";

export const revalidate = 60;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const games = await getAllGames();
  const game = games.find((g) => g.id === id);

  if (!game) notFound();

  const streams = await getStreams(game);
  const lg = LEAGUE_BY_ID[game.league];
  const isLive = game.status === "in";
  const isFinal = game.status === "post";
  const showScore = !(game.status === "pre") && game.awayTeam.score != null && game.homeTeam.score != null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <a href="/" style={{ color: "inherit", textDecoration: "none" }}>valence</a>
        </div>
        <div className="top-meta">
          <span className="live-pill">
            <span className="live-dot" />
            {lg.short} · {game.statusDisplay}
          </span>
        </div>
      </header>
      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="player" style={{ aspectRatio: "16/9" }}>
            {streams.length > 0 ? (
              <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                <StreamFrame streams={streams} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg)", marginBottom: 14 }}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3v10l9-5z" /></svg>
                </div>
                <div className="player-placeholder">
                  <span className="big">{game.awayTeam.name} <span style={{ color: "var(--subtle)" }}>vs</span> {game.homeTeam.name}</span>
                  stream embed
                </div>
              </div>
            )}
            <div className="player-controls">
              {isLive && <span className="live-marker"><span className="live-dot" /> LIVE</span>}
              {!isLive && !isFinal && <span>STARTS {formatTimePT(game.startTime)}</span>}
              {isFinal && <span>FINAL</span>}
            </div>
          </div>

          <div className="scorebox">
            <div className="matchup-grid">
              <div className="side">
                <div className="badge-lg" style={{ background: teamColor(game.awayTeam.abbreviation) }}>
                  {game.awayTeam.abbreviation.slice(0, 3)}
                </div>
                <div className="name">{game.awayTeam.name}</div>
              </div>
              <div className="scores">
                <span className={parseInt(game.awayTeam.score || "0") > parseInt(game.homeTeam.score || "0") ? "winner" : "loser"}>
                  {showScore ? game.awayTeam.score : "—"}
                </span>
                <span className="dash">:</span>
                <span className={parseInt(game.homeTeam.score || "0") > parseInt(game.awayTeam.score || "0") ? "winner" : "loser"}>
                  {showScore ? game.homeTeam.score : "—"}
                </span>
              </div>
              <div className="side">
                <div className="badge-lg" style={{ background: teamColor(game.homeTeam.abbreviation) }}>
                  {game.homeTeam.abbreviation.slice(0, 3)}
                </div>
                <div className="name">{game.homeTeam.name}</div>
              </div>
            </div>
            <div className={`status-line ${!isLive && !isFinal ? "pre" : ""}`}>
              {isLive && <><span className="live-dot" style={{ display: "inline-block", marginRight: 4 }} />LIVE · {game.statusDisplay}</>}
              {!isLive && !isFinal && <>STARTS {formatTimePT(game.startTime)}</>}
              {isFinal && <>FINAL</>}
            </div>
          </div>
        </div>

        <aside className="watch" style={{ maxWidth: 360 }}>
          <div className="watch-header">
            <span className="league-tag">{lg.short}</span>
            <span style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500 }}>
              {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
            </span>
          </div>
          <div className="watch-info">
            <div className="info-row"><span className="lbl">League</span><span className="val">{lg.label}</span></div>
            <div className="info-row"><span className="lbl">Start</span><span className="val">{formatTimePT(game.startTime)}</span></div>
            <div className="info-row"><span className="lbl">Status</span><span className="val">{game.statusDisplay}</span></div>
            <div className="info-row"><span className="lbl">Streams</span><span className="val">{streams.length} available</span></div>
            {streams.length > 1 && (
              <div className="info-row">
                <span className="lbl">Sources</span>
                <span className="val">
                  {streams.map((s) => `${s.label} (${s.quality}${s.language ? ` · ${s.language}` : ""})`).join(", ")}
                </span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function teamColor(abbr: string): string {
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
  return `oklch(0.62 0.14 ${h % 360})`;
}

import type { Stream } from "@/lib/types";

function StreamFrame({ streams }: { streams: Stream[] }) {
  return (
    <iframe
      src={streams[0].url}
      style={{ width: "100%", height: "100%", border: 0 }}
      allowFullScreen
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
    />
  );
}
