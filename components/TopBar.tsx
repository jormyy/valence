"use client";

import { useRef, useEffect, memo } from "react";
import { SearchIcon } from "@/components/icons";

interface Props {
  search: string;
  setSearch: (v: string) => void;
  dateIdx: number;
  setDateIdx: (v: number) => void;
  dateLabels: [string, string, string];
  liveCount: number;
  dateLoading?: boolean;
  lastUpdated?: Date | null;
}

function TopBar({
  search, setSearch,
  dateIdx, setDateIdx,
  dateLabels,
  liveCount,
  dateLoading,
  lastUpdated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const updatedStr = lastUpdated
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(lastUpdated)
    : null;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span>valence</span>
      </div>

      <div className="searchbox">
        <SearchIcon />
        <input
          ref={inputRef}
          placeholder="Search team, league, player…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>⌘K</kbd>
      </div>

      <div className="date-nav">
        {dateLabels.map((label, i) => (
          <button
            key={i}
            className={i === dateIdx ? "active" : ""}
            onClick={() => setDateIdx(i)}
            disabled={dateLoading && i !== dateIdx}
          >
            {dateLoading && i === dateIdx ? <span className="date-loading" /> : label}
          </button>
        ))}
      </div>

      <div className="top-meta">
        {updatedStr && (
          <span className="updated-label">↻ {updatedStr}</span>
        )}
        <span className="live-pill">
          <span className="live-dot" />
          {liveCount} live
        </span>
      </div>
    </header>
  );
}

export default memo(TopBar);
