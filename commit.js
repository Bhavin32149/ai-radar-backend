// AI Radar Backend — Commit Pipeline (commit.js)
// Runs every 30 minutes via GitHub Actions
// Reads buffer → generates trending/breaking/summary → writes all JSON files

import { loadBuffer, clearBuffer }  from "./src/buffer.js";
import { loadExistingDay, writeAllFiles } from "./src/writer.js";
import { detectTrending }           from "./src/trending.js";
import { generateSummary }          from "./src/summary.js";
import { deduplicateItems }         from "./src/dedupe.js";
import { log, errorLog, todayKey }  from "./src/utils.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ── Persistent seen-IDs tracking ──────────────────────────────────────────────
// Tracks URLs already committed to gh-pages so we don't re-add them after
// the buffer is cleared. Stored on main branch in data/seen.json.

const SEEN_FILE = "./data/seen.json";
const MAX_SEEN  = 5000; // keep last 5000 URLs to prevent unbounded growth

function loadSeen() {
  try {
    if (!existsSync(SEEN_FILE)) return new Set();
    const raw = readFileSync(SEEN_FILE, "utf8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveSeen(seen) {
  // Keep only the most recent MAX_SEEN entries
  const arr = [...seen].slice(-MAX_SEEN);
  writeFileSync(SEEN_FILE, JSON.stringify(arr, null, 2));
}

async function run() {
  const startTime = Date.now();
  log("Commit pipeline started");

  try {
    // 1. Load buffer accumulated from fetch runs
    const buffered = await loadBuffer();
    log(`Buffer contains ${buffered.length} items`);

    // 2. Load persistent seen-URLs (prevents re-adding already committed items)
    const seen       = loadSeen();
    const seenUrls   = new Set([...seen]);
    const seenTitles = new Set();

    // 3. Load today's existing committed data (from main branch disk)
    const existing = await loadExistingDay(todayKey());
    log(`Existing today: ${existing.length} items`);

    // Add existing today items to seen sets
    for (const item of existing) {
      if (item.url)   seenUrls.add(item.url);
      if (item.title) seenTitles.add(item.title.toLowerCase().trim());
    }

    // 4. Deduplicate buffer against seen URLs + today's existing items
    const fresh = deduplicateItems(buffered, seenUrls, seenTitles);
    log(`${fresh.length} genuinely new items to commit`);

    // ── GUARD: Don't write empty files ────────────────────────────────────────
    // Fixes the bug where a commit run with empty buffer + no existing data
    // overwrites gh-pages latest.json with { count: 0, items: [] }
    if (!fresh.length && existing.length === 0) {
      log("Buffer empty and no existing data for today — skipping write");
      await clearBuffer();
      return;
    }

    if (!fresh.length && existing.length > 0) {
      log("No new items to commit — skipping (existing data preserved on gh-pages)");
      await clearBuffer();
      return;
    }

    const allToday = [...existing, ...fresh].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    // 5. Detect trending topics from today's full dataset
    const trending = detectTrending(allToday);
    log(`Detected ${trending.trending.length} trending topics`);

    // 6. Generate daily summary (only if first commit run of day)
    const summary = await generateSummary(allToday, existing.length === 0);

    // 7. Write all JSON files
    await writeAllFiles({
      items:    allToday,
      trending,
      summary,
      dateKey:  todayKey(),
    });

    // 8. Update persistent seen-URLs with newly committed items
    for (const item of fresh) {
      if (item.url) seen.add(item.url);
    }
    saveSeen(seen);
    log(`Seen set updated (${seen.size} total URLs tracked)`);

    // 9. Clear buffer after successful write
    await clearBuffer();
    log("Buffer cleared");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Commit pipeline complete in ${elapsed}s`);

  } catch (err) {
    errorLog("Commit pipeline failed:", err);
    process.exit(1);
  }
}

run();
