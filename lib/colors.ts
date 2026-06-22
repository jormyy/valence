// Deterministic team/badge color from an abbreviation — a pure view helper.
export function teamColor(abbr: string): string {
  let h = 0;
  for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
  return `oklch(0.62 0.14 ${h % 360})`;
}
