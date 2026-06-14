"use client";

import { useState, useEffect, useRef } from "react";

// Natural ad-block for the cross-origin stream embeds.
//
// Findings from driving these embeds against live streams (see scripts/probe*.cjs):
//  • The embeds fund themselves with Adcash `runPop` pop-unders fired from the first CLICK that
//    reaches the iframe document. There are zero page-redirects — the whole threat is click pops.
//  • Sandbox (the only thing that can stop a cross-origin window.open) is detected by every provider
//    and blanks the video, so it's off the table.
//  • The player's own control bar stops click propagation, so clicks on it never reach Adcash. And
//    — the key crack — the players answer to the KEYBOARD: focus the frame and press Space and JW
//    starts via a keydown handler that produces no click, so Adcash never fires. That gives a fully
//    ad-free start on the great majority of sources.
//
// So: (1) auto-focus the frame and offer "press Space to play" — an ad-free start (no click → no
// pop). (2) A transparent guard absorbs clicks over the video BODY, so even if you tap, accidental/
// aggressive taps can't fire a pop; the bottom control-bar strip is left exposed so the embed's own
// controls work ad-free. (3) "tap to play" stays as a fallback (e.g. touch, or a keyboard-less
// player) — it drops the guard for one tap (the source's single gate ad) and re-arms.

// Height left uncovered at the bottom for the embed's native control bar (~fixed pixels; the 11%
// term keeps a fullscreen player only uncovering the ad-catcher-free bottom strip).
const CONTROL_BAR_BAND = "max(52px, 11%)";
const INTERACT_WINDOW_MS = 6000;

export default function Player({ url }: { url: string }) {
  const [armed, setArmed] = useState(true);
  const [hint, setHint] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New stream → re-arm, re-show the hint, and pull keyboard focus to the frame so Space starts it.
  useEffect(() => {
    setArmed(true);
    setHint(true);
    const f = iframeRef.current;
    const focus = () => { try { f?.contentWindow?.focus(); } catch {} f?.focus(); };
    focus();
    const t = setTimeout(focus, 1200); // again once the embed has booted
    return () => { clearTimeout(t); if (timer.current) clearTimeout(timer.current); };
  }, [url]);

  function dropForTap() {
    setArmed(false);
    setHint(false);
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
        ref={iframeRef}
        key={url}
        src={url}
        className="player-iframe"
        title="Live stream"
        tabIndex={0}
        referrerPolicy="no-referrer"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
      />

      {armed && (
        // Covers the video body (top → control-bar band); below the player chrome (z-index 3) so our
        // fullscreen button stays usable. Swallows every press so a tap can't reach Adcash. Keyboard
        // focus still reaches the frame (focus order ignores this overlay), so Space-to-play works.
        <div
          className="ad-guard"
          style={{ bottom: CONTROL_BAR_BAND }}
          onClickCapture={absorb}
          onMouseDownCapture={absorb}
          onPointerDownCapture={absorb}
          onAuxClickCapture={absorb}
          onContextMenuCapture={absorb}
          title="Ad-guard on — pop-up ads can't fire from the video. Press Space to play ad-free; the control bar below stays usable."
        />
      )}

      {armed && hint && (
        <button
          className="kbd-start"
          onClick={() => { try { iframeRef.current?.contentWindow?.focus(); } catch {} iframeRef.current?.focus(); }}
          title="Press Space to start the stream with no ad. (Or use 'tap to play' below for touch — that shows the source's one ad.)"
        >
          <span className="kbd-key">Space</span> to play · ad-free
        </button>
      )}

      <button
        className={`guard-toggle ${armed ? "" : "off"}`}
        onClick={() => (armed ? dropForTap() : setArmed(true))}
        title={
          armed
            ? "Touch fallback: drops the guard so you can tap the video to play. The source shows one ad on its play button; the guard re-arms itself."
            : "Re-arm the ad-guard now"
        }
      >
        {armed ? "▶ tap to play" : "🛡 re-arming…"}
      </button>
    </>
  );
}
