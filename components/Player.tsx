"use client";

import { useState, useEffect, useRef } from "react";

// Natural ad-block for the cross-origin stream embeds.
//
// Findings from driving these embeds against live streams (see scripts/probe*.cjs):
//  • The embeds fund themselves with window.open pop-unders fired from a click-catcher overlay that
//    covers the VIDEO BODY (the centre play button included). There are zero page-redirects — the
//    whole threat is pop-ups/pop-unders from body clicks.
//  • The one client-side lever that can stop a cross-origin iframe's window.open is the `sandbox`
//    attribute — but every provider (embed.st / embedindia / streamapi) detects ANY sandbox with a
//    token-proof probe and blanks the video ("Remove sandbox attributes"). Sandboxing breaks the
//    video, so it's off the table (and evading that detection is out of scope). The providers also
//    Referer/token-gate their HLS, so we can't lift the stream into our own player either.
//  • Crucially, the click-catcher does NOT cover the bottom strip: the player's own control bar
//    (JW Player — play/pause, volume, live, PiP, fullscreen) sits there and clicks on it neither
//    fire ads nor get blocked.
//
// So we break the old shield's all-or-nothing trade-off spatially: a transparent guard absorbs
// clicks over the video BODY (killing the pop-under ad-catcher), while the bottom control-bar strip
// is left fully exposed so the embed's OWN controls work, naturally and ad-free. Device volume and
// our own fullscreen button (above this layer) work regardless.
//
// The provider gates the very first "press play" behind its ad-catcher — that one start tap is the
// only place a pop-under can still fire, and it can't be separated from "start the video" client-
// side. The "tap to play" control drops the guard for that single deliberate tap and then re-arms
// itself, so the lone gate ad is bounded and everything after is driven from the ad-free control bar.

// Height left uncovered at the bottom for the embed's native control bar. The control bar is a
// roughly fixed pixel height, so a pixel floor covers it even in the small panel, while the 11%
// term keeps a large/fullscreen player only uncovering the ad-catcher-free bottom strip (~12%).
const CONTROL_BAR_BAND = "max(52px, 11%)";
// How long the guard stays down after you ask to interact, before it re-arms on its own.
const INTERACT_WINDOW_MS = 6000;

export default function Player({ url }: { url: string }) {
  const [armed, setArmed] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-arm for every new stream.
  useEffect(() => {
    setArmed(true);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [url]);

  function dropForInteraction() {
    setArmed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(true), INTERACT_WINDOW_MS);
  }

  const absorb = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <iframe
        key={url}
        src={url}
        className="player-iframe"
        title="Live stream"
        referrerPolicy="no-referrer"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />

      {armed && (
        // Covers the video body (top → control-bar band). Topmost over the embed, below the player
        // chrome (z-index 3) so our own controls stay usable. Swallows every press so the embed's
        // pop-under listeners never receive a body click.
        <div
          className="ad-guard"
          style={{ bottom: CONTROL_BAR_BAND }}
          onClickCapture={absorb}
          onMouseDownCapture={absorb}
          onPointerDownCapture={absorb}
          onAuxClickCapture={absorb}
          onContextMenuCapture={absorb}
          title="Ad-guard on — pop-up ads can't fire from the video. The stream's own control bar below stays usable."
        />
      )}

      <button
        className={`guard-toggle ${armed ? "" : "off"}`}
        onClick={() => (armed ? dropForInteraction() : setArmed(true))}
        title={
          armed
            ? "Drops the ad-guard so you can tap the video to press play. The source plays one ad on its play button; the guard re-arms itself a few seconds later."
            : "Re-arm the ad-guard now"
        }
      >
        {armed ? "▶ tap to play" : "🛡 re-arming…"}
      </button>
    </>
  );
}
