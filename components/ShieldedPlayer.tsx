"use client";

import { useState } from "react";

// The stream embeds fund themselves with popup / pop-under / redirect ads that fire from click
// handlers inside the (cross-origin) iframe. We can't reach into that iframe to disable them, so
// instead we lay a transparent shield over the whole player: every tap lands on the shield, so
// the embed never receives the click that launches an ad — and, starved of the user-activation
// it would need, the browser's own popup blocker stops scripted popups too. 100% client-side,
// no server.
//
// Trade-off: while the shield is up you can't use the embed's OWN controls (play/pause/volume/
// quality), since those are clicks too. The toggle drops the shield when you want them. Device
// volume and our own fullscreen button work regardless (fullscreen lives above the shield).
export default function ShieldedPlayer({ url }: { url: string }) {
  const [shielded, setShielded] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <iframe
        key={url}
        src={url}
        className="player-iframe"
        allowFullScreen
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      />
      {shielded && (
        <div
          className="click-shield"
          // Being the topmost layer already keeps clicks off the embed; we also swallow the
          // event so nothing reaches any page-level ad listener.
          onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onAuxClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onContextMenuCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
          title="Ad-shield on — taps are blocked so the stream's pop-up ads can't fire"
        />
      )}

      <div className="shield-bar">
        {showInfo && (
          <div className="shield-info" role="status">
            <strong>Ad-shield</strong>{" "}covers the video so the stream&apos;s pop-up &amp;
            redirect ads can&apos;t fire when you tap.
            <br />
            While it&apos;s on, the stream&apos;s own play/pause/volume don&apos;t respond —
            tap <em>Shield off</em>{" "}to use them, then re-arm. Fullscreen and your
            device&apos;s volume work either way.
          </div>
        )}
        <button
          className="shield-info-btn"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="About the ad-shield"
          aria-expanded={showInfo}
        >
          ⓘ
        </button>
        <button
          className={`shield-toggle ${shielded ? "" : "off"}`}
          onClick={() => setShielded((s) => !s)}
          title={
            shielded
              ? "Unlock the stream's own controls (its pop-up ads may appear)"
              : "Re-arm the ad-shield"
          }
        >
          {shielded ? "🛡 Ad-shield on" : "⚠ Shield off"}
        </button>
      </div>
    </>
  );
}
