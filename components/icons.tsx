import type { Sport } from "@/lib/metadata";

interface IconProps { size?: number }

const stroke = {
  stroke: "currentColor",
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const fine = { ...stroke, strokeWidth: 1.4 };
const bold = { ...stroke, strokeWidth: 1.5 };

function unreachableSport(sport: never): never {
  throw new Error(`Missing sport icon for ${sport}`);
}

export function SportIcon({ sport, size = 15 }: IconProps & { sport: Sport }) {
  switch (sport) {
    case "basketball":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M2 8h12 M8 2v12 M3.5 3.5l9 9 M12.5 3.5l-9 9" /></svg>;
    case "baseball":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M3.5 4.5c2 1 2.5 4 2 6.5 M12.5 4.5c-2 1-2.5 4-2 6.5" /></svg>;
    case "tennis":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M2.5 5.5c3 1.5 7 1.5 11 0 M2.5 10.5c3-1.5 7-1.5 11 0" /></svg>;
  }
  return unreachableSport(sport);
}

export function GridIcon({ size = 14 }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...bold}>
      <rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" />
    </svg>
  );
}

export function BellIcon({ size = 13 }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...bold}>
      <path d="M4 11V7a4 4 0 018 0v4l1 1H3z M7 13a1 1 0 002 0" />
    </svg>
  );
}

export function SearchIcon({ size = 13 }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...bold}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export function StreamIcon({ size = 10 }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...bold}>
      <rect x="2" y="4" width="9" height="8" rx="1" />
      <path d="M11 7l3-2v6l-3-2z" />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...bold}>
      <path d="M4 4l8 8 M12 4l-8 8" />
    </svg>
  );
}

export function PlayIcon({ size = 22 }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3v10l9-5z" />
    </svg>
  );
}

export function FullscreenIcon({ size = 13 }: IconProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...bold}>
      <path d="M2 6V2h4 M14 6V2h-4 M2 10v4h4 M14 10v4h-4" />
    </svg>
  );
}
