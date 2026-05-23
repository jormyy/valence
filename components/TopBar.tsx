"use client";

interface Props {
  search: string;
  setSearch: (v: string) => void;
  dateIdx: number;
  setDateIdx: (v: number) => void;
  liveCount: number;
}

const DATES = ["Yesterday", "Today", "Tomorrow"];

export default function TopBar({ search, setSearch, dateIdx, setDateIdx, liveCount }: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span>valence</span>
      </div>

      <div className="searchbox">
        <SearchIcon />
        <input
          placeholder="Search team, league, player…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>⌘K</kbd>
      </div>

      <div className="date-nav">
        {DATES.map((d, i) => (
          <button
            key={d}
            className={i === dateIdx ? "active" : ""}
            onClick={() => setDateIdx(i)}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="top-meta">
        <span className="live-pill">
          <span className="live-dot" />
          {liveCount} live
        </span>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}
