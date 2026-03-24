"use client";

import { useState } from "react";
import type { Stream } from "@/lib/types";

interface Props {
  streams: Stream[];
}

export default function StreamList({ streams }: Props) {
  const [active, setActive] = useState(0);

  const current = streams[active];

  return (
    <div className="flex h-full flex-col">
      {/* Player */}
      <div className="relative flex-1 bg-black">
        <iframe
          key={current.url}
          src={current.url}
          className="h-full w-full"
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media"
          referrerPolicy="no-referrer"
          // sandbox blocks popups/redirects while still allowing the player to run
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock"
        />
      </div>

      {/* Stream selector */}
      {streams.length > 1 && (
        <div className="flex flex-wrap gap-2 border-t border-white/10 bg-[#111] p-3">
          {streams.map((stream, i) => (
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
