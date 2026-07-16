export const SPORTS = [
  { id: "sports", label: "Sports" },
  { id: "basketball", label: "Basketball" },
  { id: "baseball", label: "Baseball" },
  { id: "american-football", label: "Football" },
  { id: "hockey", label: "Hockey" },
  { id: "soccer", label: "Soccer" },
  { id: "tennis", label: "Tennis" },
  { id: "combat", label: "Combat" },
  { id: "aussie-rules", label: "Aussie Rules" },
  { id: "rugby", label: "Rugby" },
  { id: "volleyball", label: "Volleyball" },
  { id: "cricket", label: "Cricket" },
  { id: "racing", label: "Racing" },
  { id: "golf", label: "Golf" },
] as const;

export type Sport = (typeof SPORTS)[number]["id"];
export type SportInfo = (typeof SPORTS)[number];
