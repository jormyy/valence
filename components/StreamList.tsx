"use client";

import { useState, useEffect } from "react";
import type { Stream } from "@/lib/types";

interface Props {
  streams: Stream[];
}

const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-popups-to-escape-sandbox";

function sandboxKey(url: string) {
  return `sandbox-disabled:${url}`;
}

function isSandboxDisabled(url: string) {
  try {
    return localStorage.getItem(sandboxKey(url)) === "1";
  } catch {
    return false;
  }
}

function disableSandbox(url: string) {
  try {
    localStorage.setItem(sandboxKey(url), "1");
  } catch {}
}

export default function StreamList({ streams }: Props) {
  const [active, setActive] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  // Track per-stream sandbox override — keyed by stream URL
  const [sandboxOff, setSandboxOff] = useState<Record<string, boolean>>({});

  useEffect(() => {
    window.open = () => null;
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

    // Load any saved preferences from localStorage
    const saved: Record<string, boolean> = {};
    for (const stream of streams) {
      if (isSandboxDisabled(stream.url)) saved[stream.url] = true;
    }
    setSandboxOff(saved);
  }, []);

  const ordered = isMobile ? [...streams].reverse() : streams;
  const current = ordered[active];
  const useSandbox = isMobile && !sandboxOff[current.url];

  function handleDisableSandbox() {
    disableSandbox(current.url);
    setSandboxOff((prev) => ({ ...prev, [current.url]: true }));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Player */}
      <div className="relative flex-1 bg-black">
        <iframe
          key={current.url + (useSandbox ? "-sandboxed" : "")}
          src={current.url}
          className="h-full w-full"
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          {...(useSandbox ? { sandbox: SANDBOX } : {})}
        />
      </div>

      {/* Stream not loading fallback — mobile only */}
      {isMobile && useSandbox && (
        <div className="flex items-center justify-end gap-2 border-t border-white/5 bg-[#0d0d0d] px-3 py-2">
          <span className="text-xs text-white/30">Stream not loading?</span>
          <button
            onClick={handleDisableSandbox}
            className="text-xs text-white/50 underline underline-offset-2 hover:text-white/80"
          >
            Disable ad block for this stream
          </button>
        </div>
      )}

      {/* Stream selector */}
      {streams.length > 1 && (
        <div className="flex flex-wrap gap-2 border-t border-white/10 bg-[#111] p-3">
          {ordered.map((stream, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                i === active
                  ? "bg-white text-black"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              {stream.label}
              {stream.quality && (
                <span className="ml-1.5 opacity-60">{stream.quality}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
