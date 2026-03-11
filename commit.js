// AI Radar Backend — Commit Pipeline (commit.js)
// Runs every 30 minutes via GitHub Actions
// Reads buffer → generates trending/breaking/summary → writes all JSON files

import { loadBuffer, clearBuffer }  from "./src/buffer.js";
import { loadExistingDay, writeAllFiles } from "./src/writer.js";
import { detectTrending }           from "./src/trending.js";
import { generateSummary }          from "./src/summary.js";
import { deduplicateItems }         from "./src/dedupe.js";
import { log, errorLog, todayKey }  from "./src/utils.js";

async function run() {
  const startTime = Date.now();
  log("Commit pipeline started");

  try {
    // 1. Load buffer accumulated from fetch runs
    const buffered = await loadBuffer();
    log(`Buffer contains ${buffered.length} items`);

    // 2. Load today's existing committed data
    const existing = await loadExistingDay(todayKey());
    log(`Existing today: ${existing.length} items`);

    // 3. Merge buffer with existing, deduplicate
    const existingUrls   = new Set(existing.map(i => i.url));
    const existingTitles = new Set(existing.map(i => i.title?.toLowerCase().trim()));
    const fresh = deduplicateItems(buffered, existingUrls, existingTitles);
    log(`${fresh.length} genuinely new items to commit`);

    if (!fresh.length && existing.length > 0) {
      log("No new items to commit — skipping");
      return;
    }

    const allToday = [...existing, ...fresh].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    // 4. Detect trending topics from today's full dataset
    const trending = detectTrending(allToday);
    log(`Detected ${trending.trending.length} trending topics`);

    // 5. Generate daily summary (only if we have enough items and it's not already done today)
    const summary = await generateSummary(allToday, existing.length === 0);

    // 6. Write all JSON files
    await writeAllFiles({
      items:    allToday,
      trending,
      summary,
      dateKey:  todayKey(),
    });

    // 7. Clear buffer after successful write
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
