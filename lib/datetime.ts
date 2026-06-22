// Pacific-time date helpers shared across ESPN parsing, source events, and the UI.
// Kept in one place so a timezone fix never has to be made in three files.
export const PT_TZ = "America/Los_Angeles";

// Constructing an Intl.DateTimeFormat is far more expensive than .format() on a
// cached instance, and these run thousands of times per getAllGames (every event is
// date-filtered). Options are static, so share one instance per format.
const PT_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: PT_TZ });
const PT_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: PT_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function todayInPT(): string {
  return PT_DAY_FORMAT.format(new Date());
}

// "YYYY-MM-DD" in PT for any Date / epoch-ms / ISO-string input.
export function dateInPT(input: number | string | Date): string {
  return PT_DAY_FORMAT.format(new Date(input));
}

export function formatTimePT(input: number | string | Date): string {
  return PT_TIME_FORMAT.format(new Date(input)) + " PT";
}

// "20260521" or "2026-05-21" → "2026-05-21". Empty input → today; unparseable → null.
export function normalizeDate(dateStr?: string): string | null {
  if (!dateStr) return todayInPT();
  if (/^\d{8}$/.test(dateStr)) return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return null;
}

// Whole-day index for a "YYYY-MM-DD" string, for cheap day-distance comparisons.
export function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}
