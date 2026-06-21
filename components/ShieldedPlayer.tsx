"use client";

import { useEffect, useState } from "react";

const STRICT_SANDBOX = "allow-scripts allow-presentation";
// iPhone/iPad WebKit has no MediaSource, so HLS can only play through the
// native <video> element. But WebKit refuses to load media into a <video>
// from a null-origin (sandboxed, no allow-same-origin) frame, so the native
// path needs the player frame to keep an origin. Only those clients get
// allow-same-origin; every MSE browser (desktop, Android, macOS/iPad Safari)
// keeps the strict sandbox so untrusted provider pages stay fully isolated.
const NATIVE_HLS_SANDBOX = "allow-scripts allow-presentation allow-same-origin";

export default function ShieldedPlayer({ url }: { url: string }) {
  const src = `/api/embed?u=${encodeURIComponent(url)}&p=${encodeURIComponent(url)}`;
  const [sandbox, setSandbox] = useState(STRICT_SANDBOX);

  // Runs only on the client after hydration, so SSR and the first client render
  // both use STRICT_SANDBOX (no hydration mismatch). On Apple devices the frame
  // then remounts with allow-same-origin via the sandbox-keyed `key`.
  useEffect(() => {
    if (typeof window.MediaSource === "undefined") {
      setSandbox(NATIVE_HLS_SANDBOX);
    }
  }, []);

  return (
    <iframe
      key={`${src}|${sandbox}`}
      src={src}
      className="player-iframe"
      title="Live stream"
      allowFullScreen
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      sandbox={sandbox}
      referrerPolicy="no-referrer"
    />
  );
}
