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
    case "sports":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M4 3h8v2.5a4 4 0 01-8 0z" /><path d="M4 4H2.5c0 2 .8 3.2 2.4 3.6 M12 4h1.5c0 2-.8 3.2-2.4 3.6 M8 9.5V13 M5.5 13h5" /></svg>;
    case "basketball":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M2 8h12 M8 2v12 M3.5 3.5l9 9 M12.5 3.5l-9 9" /></svg>;
    case "baseball":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M3.5 4.5c2 1 2.5 4 2 6.5 M12.5 4.5c-2 1-2.5 4-2 6.5" /></svg>;
    case "american-football":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M2.5 9.8C3.6 5.4 6.5 2.5 10.9 1.7c1.5 2.1 2 4.9 1.1 7.3-1 2.8-3.5 4.8-7.1 5.3-1.3-1.1-2.1-2.6-2.4-4.5z" /><path d="M5 11L11 5 M7 10l-1-1 M8.5 8.5l-1-1 M10 7l-1-1" /></svg>;
    case "hockey":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M5 2l4 10 M11 2L7 12 M3 13h8.5c1 0 1.8-.5 1.8-1.2S12.5 10.5 11.5 10.5H10" /></svg>;
    case "soccer":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M8 5l2.6 1.9-1 3.1H6.4l-1-3.1z M8 5V2 M10.6 6.9l2.7-.8 M9.6 10l1.7 2.2 M6.4 10l-1.7 2.2 M5.4 6.9l-2.7-.8" /></svg>;
    case "tennis":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M2.5 5.5c3 1.5 7 1.5 11 0 M2.5 10.5c3-1.5 7-1.5 11 0" /></svg>;
    case "combat":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M5 8.5V4.2a1 1 0 112 0V8 M7 7V3.5a1 1 0 112 0V8 M9 7V4a1 1 0 112 0v5.5c0 2.2-1.4 4-3.5 4h-1C4.5 13.5 3 12 3 9.8V7a1 1 0 112 0" /></svg>;
    case "aussie-rules":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M3 9.5c.9-4 3.6-6.3 8-7 1.4 1.9 1.8 4.3.9 6.5-.9 2.5-3.3 4-7.1 4.6A6 6 0 013 9.5z" /><path d="M5.2 10.5l5-5 M6.5 9.7l-.7-.7 M8 8.2l-.7-.7 M9.5 6.7l-.7-.7" /></svg>;
    case "rugby":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M2.8 9.8c.8-4.2 3.6-6.9 8.3-8.1 1.6 2 2.2 4.8 1.4 7.3-.9 2.8-3.4 4.6-7.4 5.3-1.3-1.1-2.1-2.6-2.3-4.5z" /><path d="M5.3 11l5.4-5.4 M7 9.9l-1-1 M8.5 8.4l-1-1 M10 6.9l-1-1" /></svg>;
    case "volleyball":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><circle cx="8" cy="8" r="6" /><path d="M4.2 4.4c2.8.3 5 2.1 6.6 5.3 M8 2.1c-1.5 2.6-1.6 5.3-.4 8.1 M13.3 6.1c-2.7.1-5 1.4-6.9 4" /></svg>;
    case "cricket":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M10.5 2.5l3 3-7.7 7.7-3-3z M2.5 13.5h5 M11.2 4.8l-1.9-1.9" /><circle cx="12.2" cy="11.8" r="1.3" /></svg>;
    case "racing":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M2.5 10.5h7.8c1.4 0 2.7-.8 3.2-2.1l.7-1.9H11l-1.2-2H6.2l-1.4 2H2.5z" /><circle cx="5" cy="11" r="1.5" /><circle cx="11" cy="11" r="1.5" /></svg>;
    case "golf":
      return <svg width={size} height={size} viewBox="0 0 16 16" {...fine}><path d="M6 14h6 M8 14V2l5 2-5 2" /><circle cx="4" cy="12.5" r="1" /></svg>;
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
