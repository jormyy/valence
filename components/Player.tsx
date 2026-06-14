"use client";

import { useState } from "react";

// Natural ad-block for the cross-origin stream embeds.
//
// Findings from driving these embeds against live streams (see scripts/probe*.cjs):
//  • The embeds fund themselves with window.open pop-unders fired from a click-catcher overlay that
//    covers the VIDEO BODY (the centre play button included). There are zero page-redirects — the
//    whole threat is pop-ups/pop-unders from body clicks.
//  • The one client-side lever that can stop a cross-origin iframe's window.open is the `sandbox`
//    attribute — but every provider (embed.st / embedindia / streamapi) detects ANY sandbox with a
//    token-proof probe and blanks the video ("Remove sandbox attributes"). So sandboxing breaks the
//    video; it's off the table (and evading that detection is out of scope).
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
// only place a pop-under can still fire, and it can't be separated from "start the video" without
// sandbox (refused) or replacing the stream (forbidden). The guard lets you drop it for that single
// deliberate tap, then re-arms; everything after is driven from the ad-free control bar.

// Height left uncovered at the bottom for the embed's native control bar. The control bar is a
// roughly fixed pixel height, so we use a pixel floor (covers it even in the small panel) with an
// 11% term so a large/fullscreen player still only uncovers the ad-catcher-free bottom strip
// (measured safe zone: bottom ~12%).
const CONTROL_BAR_BAND = "max(52px, 11%)";

export default function Player({ url }: { url: string }) {
  const [guard, setGuard] = useState(true);

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

      {guard && (
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
        className={`guard-toggle ${guard ? "" : "off"}`}
        onClick={() => setGuard((g) => !g)}
        title={
          guard
            ? "Tap the video itself (e.g. to press play). The source shows one ad on its play button — re-arm right after."
            : "Re-arm the ad-guard"
        }
      >
        {guard ? "▶ tap video" : "⚠ guard off"}
      </button>
    </>
  );
}
