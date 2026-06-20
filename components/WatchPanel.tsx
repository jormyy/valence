"use client";

import { useState, useEffect, useRef } from "react";
import type { GameWithStreams, Stream } from "@/lib/types";
import { LEAGUE_BY_ID, teamColor } from "@/lib/metadata";
import { formatTimePT } from "@/lib/espn";
import { scoreView } from "@/lib/game";
import { CloseIcon, FullscreenIcon, PlayIcon } from "@/components/icons";
import StatsPanel from "@/components/StatsPanel";
import RelatedGames from "@/components/RelatedGames";
import ShieldedPlayer from "@/components/ShieldedPlayer";

interface Props {
  game: GameWithStreams;
  streams: Stream[];
  onClose: () => void;
  allGames: GameWithStreams[];
  onPick: (id: string) => void;
}

export default function WatchPanel({ game, streams, onClose, allGames, onPick }: Props) {
  const [activeStream, setActiveStream] = useState(0);
  const [failedStreams, setFailedStreams] = useState<Set<number>>(() => new Set());
  const [tab, setTab] = useState<"info" | "stats">("info");
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveStream(0);
    setFailedStreams(new Set());
    setTab("info");
    setFullscreenFallback(false);
  }, [game.id]);

  useEffect(() => {
    function syncNativeFullscreen() {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
        setFullscreenFallback(false);
      }
    }

    document.addEventListener("fullscreenchange", syncNativeFullscreen);
    document.addEventListener("webkitfullscreenchange", syncNativeFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncNativeFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncNativeFullscreen);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("player-fullscreen-open", fullscreenFallback);
    return () => document.body.classList.remove("player-fullscreen-open");
  }, [fullscreenFallback]);

  useEffect(() => {
    const current = streams[activeStream];
    if (!current || current.health === "offline" || failedStreams.has(activeStream)) return;

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (
        !data ||
        data.source !== "valence-player" ||
        data.type !== "media-error" ||
        data.target !== current.url
      ) {
        return;
      }

      const failed = new Set(failedStreams);
      failed.add(activeStream);
      setFailedStreams(failed);

      if (streams.length < 2) return;
      for (let offset = 1; offset < streams.length; offset += 1) {
        const next = (activeStream + offset) % streams.length;
        if (failed.has(next) || streams[next]?.health === "offline") continue;
        setActiveStream(next);
        return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activeStream, failedStreams, streams]);

  useEffect(() => {
    const current = streams[activeStream];
    if (current && current.health !== "offline" && !failedStreams.has(activeStream)) return;

    const next = streams.findIndex((_stream, index) =>
      streams[index]?.health !== "offline" && !failedStreams.has(index)
    );
    if (next !== -1 && next !== activeStream) setActiveStream(next);
  }, [activeStream, failedStreams, streams]);

  async function handleFullscreen() {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };
    const player = playerRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;

    if (fullscreenFallback) {
      setFullscreenFallback(false);
      return;
    }

    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return;
    }

    try {
      if (player?.requestFullscreen) {
        await player.requestFullscreen();
        return;
      }
      if (player?.webkitRequestFullscreen) {
        await player.webkitRequestFullscreen();
        return;
      }
    } catch {
      // Fall through to the CSS fullscreen path used by mobile Safari/iframe embeds.
    }

    setFullscreenFallback(true);
  }

  const lg = LEAGUE_BY_ID[game.league];
  const s = game.status;
  const sv = scoreView(game);
  const streamHealthAt = (index: number) => failedStreams.has(index) ? "offline" : streams[index]?.health;
  const currentCandidate = streams[activeStream];
  const currentHealth = currentCandidate ? streamHealthAt(activeStream) : undefined;
  const current = currentCandidate && currentHealth !== "offline" ? currentCandidate : undefined;
  const onlineStreams = streams.filter((_stream, index) => streamHealthAt(index) === "online").length;
  const checkedStreams = streams.filter((_stream, index) => {
    const health = streamHealthAt(index);
    return health === "online" || health === "offline";
  }).length;
  const playableStreams = streams.filter((_stream, index) => streamHealthAt(index) !== "offline").length;
  const streamsText = checkedStreams > 0
    ? checkedStreams === streams.length
      ? `${onlineStreams}/${streams.length} working`
      : `${onlineStreams}/${checkedStreams} checked`
    : `${streams.length} available`;

  return (
    <aside className="watch">
      <div className="watch-header">
        <span className="league-tag">{lg.short}</span>
        <span className="watch-matchup">
          {game.awayTeam.abbreviation} <span className="dim">@</span> {game.homeTeam.abbreviation}
        </span>
        {s === "in" && (
          <span className="status">
            <span className="live-dot inline" />
            {game.statusDisplay}
          </span>
        )}
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <div ref={playerRef} className={`player ${fullscreenFallback ? "fullscreen-fallback" : ""}`}>
        {current ? (
          <ShieldedPlayer url={current.url} />
        ) : (
          <div className="player-empty">
            {playableStreams > 0 && <div className="player-play"><PlayIcon /></div>}
            <div className="player-placeholder">
              <span className="big">{game.awayTeam.name} <span className="dim">vs</span> {game.homeTeam.name}</span>
              {streams.length > 0
                ? playableStreams > 0 ? "stream embed" : "all streams down"
                : s === "post"
                  ? "game finished — no stream"
                  : "no stream available yet"}
            </div>
          </div>
        )}
        <div className="player-controls">
          {s === "in" && <span className="live-marker"><span className="live-dot" /> LIVE</span>}
          {s === "pre" && <span>STARTS {formatTimePT(game.startTime)}</span>}
          {s === "post" && <span>FINAL</span>}
          {currentHealth && (
            <span className={`player-health ${currentHealth}`}>
              {currentHealth === "online" ? "OK" : "DOWN"}
            </span>
          )}
          <span className="spacer" />
          {current && (
            <button
              className="player-btn"
              onClick={handleFullscreen}
              aria-label={fullscreenFallback ? "Exit fullscreen" : "Fullscreen"}
            >
              <FullscreenIcon />
            </button>
          )}
        </div>
      </div>

      {streams.length > 1 && (
        <div className="stream-tabs">
          {streams.map((st, i) => {
            const health = streamHealthAt(i);
            const title = failedStreams.has(i)
              ? "Stream failed during playback"
              : health === "online"
                ? "Stream checked OK"
                : health === "offline"
                  ? "Stream check failed"
                  : undefined;
            return (
              <button
                key={i}
                className={`stream-tab ${i === activeStream ? "active" : ""} ${health ? `health-${health}` : ""}`}
                onClick={() => {
                  setFailedStreams((failed) => {
                    if (!failed.has(i)) return failed;
                    const next = new Set(failed);
                    next.delete(i);
                    return next;
                  });
                  setActiveStream(i);
                }}
                title={title}
              >
                {st.label} <span className="q">{st.quality}</span>
                {st.language && <span className="q">· {st.language}</span>}
                {health && (
                  <span className="stream-health">
                    {health === "online" ? "OK" : "DOWN"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="scorebox">
        <div className="matchup-grid">
          <div className="side">
            <div className="badge-lg" style={{ background: teamColor(game.awayTeam.abbreviation) }}>
              {game.awayTeam.abbreviation.slice(0, 3)}
            </div>
            <div className="name">{game.awayTeam.name}</div>
          </div>
          <div className="scores">
            <span className={sv.awayWin ? "winner" : "loser"}>{sv.show ? game.awayTeam.score : "—"}</span>
            <span className="dash">:</span>
            <span className={sv.homeWin ? "winner" : "loser"}>{sv.show ? game.homeTeam.score : "—"}</span>
          </div>
          <div className="side">
            <div className="badge-lg" style={{ background: teamColor(game.homeTeam.abbreviation) }}>
              {game.homeTeam.abbreviation.slice(0, 3)}
            </div>
            <div className="name">{game.homeTeam.name}</div>
          </div>
        </div>
        <div className={`status-line ${s === "pre" ? "pre" : ""}`}>
          {s === "in" && <><span className="live-dot inline" />LIVE · {game.statusDisplay}</>}
          {s === "pre" && <>STARTS {formatTimePT(game.startTime)}</>}
          {s === "post" && <>FINAL</>}
        </div>
      </div>

      <div className="watch-tabs">
        <button className={`watch-tab ${tab === "info" ? "active" : ""}`} onClick={() => setTab("info")}>Info</button>
        <button className={`watch-tab ${tab === "stats" ? "active" : ""}`} onClick={() => setTab("stats")}>Stats</button>
      </div>

      <div className="watch-info">
        {tab === "info" && (
          <>
            <div className="info-row"><span className="lbl">League</span><span className="val">{lg.label}</span></div>
            <div className="info-row"><span className="lbl">Start</span><span className="val">{formatTimePT(game.startTime)}</span></div>
            <div className="info-row"><span className="lbl">Status</span><span className="val">{game.statusDisplay}</span></div>
            <div className="info-row"><span className="lbl">Streams</span><span className="val">{streamsText}</span></div>
            <RelatedGames current={game} allGames={allGames} onPick={onPick} />
          </>
        )}
        {tab === "stats" && <StatsPanel gameId={game.id} status={s} />}
      </div>
    </aside>
  );
}
