"use client";

import { useState, useEffect, useRef } from "react";
import type { Game, Stream } from "@/lib/types";
import { LEAGUE_BY_ID } from "@/lib/metadata";
import { formatTimePT } from "@/lib/espn";

interface Props {
  game: Game & { streamCount?: number };
  streams: Stream[];
  onClose: () => void;
  allGames: (Game & { streamCount?: number })[];
  onPick: (id: string) => void;
}

interface StatLeader {
  athlete: string;
  value: string;
  category: string;
}

interface TeamStats {
  teamName: string;
  leaders: StatLeader[];
}

export default function WatchPanel({ game, streams, onClose, allGames, onPick }: Props) {
  const [activeStream, setActiveStream] = useState(0);
  const [tab, setTab] = useState("info");
  const [stats, setStats] = useState<TeamStats[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { setActiveStream(0); setTab("info"); setStats(null); }, [game.id]);

  // Fetch stats when the stats tab is opened
  useEffect(() => {
    if (tab !== "stats") return;
    if (stats !== null) return;
    let cancelled = false;
    setStatsLoading(true);
    fetch(`/api/stats/${game.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setStats(data.leaders || []);
          setStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStats([]);
          setStatsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [tab, game.id, stats]);

  function handleFullscreen() {
    const el = iframeRef.current;
    if (!el) return;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  }

  const lg = LEAGUE_BY_ID[game.league];
  const s = game.status;
  const showScore = s !== "pre" && game.awayTeam.score != null && game.homeTeam.score != null;
  const aScore = parseInt(game.awayTeam.score || "0");
  const hScore = parseInt(game.homeTeam.score || "0");
  const aWin = showScore && aScore > hScore;
  const hWin = showScore && hScore > aScore;

  const related = allGames
    .filter((g) => g.id !== game.id && g.status === "in" && (g.league === game.league || LEAGUE_BY_ID[g.league]?.sport === lg.sport))
    .slice(0, 5);

  const current = streams[activeStream];

  return (
    <aside className="watch">
      {/* Header */}
      <div className="watch-header">
        <span className="league-tag">{lg.short}</span>
        <span style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500 }}>
          {game.awayTeam.abbreviation} <span style={{ color: "var(--subtle)" }}>@</span> {game.homeTeam.abbreviation}
        </span>
        {s === "in" && (
          <span className="status">
            <span className="live-dot" style={{ display: "inline-block", marginRight: 4 }} />
            {game.statusDisplay}
          </span>
        )}
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      {/* Player */}
      <div className="player">
        {current ? (
          <iframe
            ref={iframeRef}
            key={current.url}
            src={current.url}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 0 }}
            allowFullScreen
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
            <div className="player-play">
              <PlayIcon />
            </div>
            <div className="player-placeholder">
              <span className="big">{game.awayTeam.name} <span style={{ color: "var(--subtle)" }}>vs</span> {game.homeTeam.name}</span>
              stream embed
            </div>
          </div>
        )}
        <div className="player-controls">
          {s === "in" && <span className="live-marker"><span className="live-dot" /> LIVE</span>}
          {s === "pre" && <span>STARTS {formatTimePT(game.startTime)}</span>}
          {s === "post" && <span>FINAL</span>}
          <span className="spacer" />
          {current && (
            <button className="player-btn" onClick={handleFullscreen} aria-label="Fullscreen">
              <FullscreenIcon />
            </button>
          )}
        </div>
      </div>

      {/* Stream tabs */}
      {streams.length > 1 && (
        <div className="stream-tabs">
          {streams.map((st, i) => (
            <button
              key={i}
              className={`stream-tab ${i === activeStream ? "active" : ""}`}
              onClick={() => setActiveStream(i)}
            >
              {st.label} <span className="q">{st.quality}</span>
              {st.language && <span className="q">· {st.language}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Scorebox */}
      <div className="scorebox">
        <div className="matchup-grid">
          <div className="side">
            <div className="badge-lg" style={{ background: teamColor(game.awayTeam.abbreviation) }}>
              {game.awayTeam.abbreviation.slice(0, 3)}
            </div>
            <div className="name">{game.awayTeam.name}</div>
          </div>
          <div className="scores">
            <span className={aWin ? "winner" : "loser"}>{showScore ? game.awayTeam.score : "—"}</span>
            <span className="dash">:</span>
            <span className={hWin ? "winner" : "loser"}>{showScore ? game.homeTeam.score : "—"}</span>
          </div>
          <div className="side">
            <div className="badge-lg" style={{ background: teamColor(game.homeTeam.abbreviation) }}>
              {game.homeTeam.abbreviation.slice(0, 3)}
            </div>
            <div className="name">{game.homeTeam.name}</div>
          </div>
        </div>
        <div className={`status-line ${s === "pre" ? "pre" : ""}`}>
          {s === "in" && <><span className="live-dot" style={{ display: "inline-block", marginRight: 4 }} />LIVE · {game.statusDisplay}</>}
          {s === "pre" && <>STARTS {formatTimePT(game.startTime)}</>}
          {s === "post" && <>FINAL</>}
        </div>
      </div>

      {/* Tabs */}
      <div className="watch-tabs">
        <button className={`watch-tab ${tab === "info" ? "active" : ""}`} onClick={() => setTab("info")}>Info</button>
        <button className={`watch-tab ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>Stats</button>
      </div>

      {/* Tab content */}
      <div className="watch-info">
        {tab === "info" && (
          <>
            <div className="info-row"><span className="lbl">League</span><span className="val">{lg.label}</span></div>
            <div className="info-row"><span className="lbl">Start</span><span className="val">{formatTimePT(game.startTime)}</span></div>
            <div className="info-row"><span className="lbl">Status</span><span className="val">{game.statusDisplay}</span></div>
            <div className="info-row"><span className="lbl">Streams</span><span className="val">{streams.length} available</span></div>

            {related.length > 0 && (
              <div className="related">
                <h4>Also live</h4>
                {related.map((r) => (
                  <div className="related-row" key={r.id} onClick={() => onPick(r.id)}>
                    <span className="live-mini" />
                    <span className="tag">{LEAGUE_BY_ID[r.league]?.short}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.awayTeam.abbreviation} {r.awayTeam.score} — {r.homeTeam.score} {r.homeTeam.abbreviation}
                    </span>
                    <span className="clk">{r.statusDisplay || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "stats" && (
          <div className="stats-panel">
            {statsLoading && (
              <div style={{ padding: "20px 6px", color: "var(--subtle)", fontSize: 12 }}>Loading…</div>
            )}
            {!statsLoading && (!stats || stats.length === 0) && (
              <div style={{ padding: "20px 6px", color: "var(--subtle)", fontSize: 12, lineHeight: 1.5 }}>
                {s === "pre"
                  ? "Stats will appear once the game tips off."
                  : "No stat leaders available for this game."}
              </div>
            )}
            {!statsLoading && stats && stats.length > 0 && stats.map((team) => (
              <div key={team.teamName} className="stats-team">
                <div className="stats-team-name">{team.teamName}</div>
                {team.leaders.map((l) => (
                  <div key={l.category} className="stats-row">
                    <span className="stats-cat">{l.category}</span>
                    <span className="stats-athlete">{l.athlete}</span>
                    <span className="stats-val">{l.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function teamColor(abbr: string): string {
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
  return `oklch(0.62 0.14 ${h % 360})`;
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3v10l9-5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8 M12 4l-8 8" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6V2h4 M14 6V2h-4 M2 10v4h4 M14 10v4h-4" />
    </svg>
  );
}
