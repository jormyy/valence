"use client";

import { useEffect, useRef, useState } from "react";

// The stream embeds fund themselves with popup / pop-under / redirect ads that fire from click
// handlers inside the (cross-origin) iframe. We can't reach into that iframe to disable them, so
// instead we lay a transparent shield over the whole player: every tap lands on the shield, so
// the embed never receives the click that launches an ad — and, starved of the user-activation
// it would need, the browser's own popup blocker stops scripted popups too. 100% client-side.
//
// Start flow: the shield starts DOWN so your first tap reaches the embed (to hit play / unmute),
// then it arms automatically. We detect that first tap because clicking a cross-origin iframe
// moves focus into it (the window blurs, the iframe becomes document.activeElement). Autoplay
// streams never get a tap, so a short timer arms the shield for them too. After arming, taps are
// blocked; the toggle drops the shield to use the embed's own controls. Fullscreen + device
// volume work regardless.
const AUTO_ARM_MS = 5000;

export default function ShieldedPlayer({ url }: { url: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [shielded, setShielded] = useState(false);
  const [arming, setArming] = useState(true); // pre-arm window: shield down, waiting for tap/timer
  const [showInfo, setShowInfo] = useState(false);

  // Per stream: start unshielded, then arm on first tap-into-embed or after the timer.
  useEffect(() => {
    setShielded(false);
    setArming(true);
    let done = false;
    const arm = () => {
      if (done) return;
      done = true;
      setShielded(true);
      setArming(false);
    };
    const onBlur = () => {
      // Defer so document.activeElement reflects the new focus target.
      setTimeout(() => {
        if (document.activeElement === iframeRef.current) arm();
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    const t = setTimeout(arm, AUTO_ARM_MS);
    return () => {
      window.removeEventListener("blur", onBlur);
      clearTimeout(t);
    };
  }, [url]);

  function toggle() {
    setArming(false); // user took manual control; stop any auto-arm hinting
    setShielded((s) => !s);
  }

  const label = shielded ? "🛡 Ad-shield on" : arming ? "🛡 Arming…" : "⚠ Shield off";

  return (
    <>
      <iframe
        ref={iframeRef}
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

      {!shielded && arming && (
        <div className="shield-hint">Tap the player to start — ad-shield arms automatically</div>
      )}

      <div className="shield-bar">
        {showInfo && (
          <div className="shield-info" role="status">
            <strong>Ad-shield</strong>{" "}covers the video so the stream&apos;s pop-up &amp;
            redirect ads can&apos;t fire when you tap. It arms automatically once the stream
            starts.
            <br />
            While it&apos;s on, the stream&apos;s own play/pause/volume don&apos;t respond — tap{" "}
            <em>Shield off</em>{" "}to use them, then re-arm. Fullscreen and your device&apos;s
            volume work either way.
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
          onClick={toggle}
          title={
            shielded
              ? "Unlock the stream's own controls (its pop-up ads may appear)"
              : "Turn the ad-shield on now"
          }
        >
          {label}
        </button>
      </div>
    </>
  );
}
