/**
 * Runs the stream scraper on a schedule.
 * Keep this running alongside `npm run dev`.
 *
 * Usage:
 *   npx tsx scripts/watch-streams.ts
 *   npx tsx scripts/watch-streams.ts --interval 15   (every 15 min, default 30)
 */

import cron from "node-cron";
import { execSync } from "child_process";

const args = process.argv.slice(2);
const intervalIdx = args.indexOf("--interval");
const intervalMin = intervalIdx !== -1 ? parseInt(args[intervalIdx + 1]) : 30;

function runScrape() {
  const now = new Date().toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" });
  console.log(`\n[${now}] Running scraper...`);
  try {
    execSync("npx tsx scripts/scrape-streams.ts", { stdio: "inherit" });
  } catch {
    console.error("Scraper failed — will retry next interval");
  }
}

// Run immediately on start
runScrape();

// Then on schedule
const cronExpr = `*/${intervalMin} * * * *`;
console.log(`\nScheduled to run every ${intervalMin} minutes (${cronExpr})\nPress Ctrl+C to stop.\n`);

cron.schedule(cronExpr, runScrape);
