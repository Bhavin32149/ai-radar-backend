// AI Radar Backend — Main Pipeline (index.js)
// Runs every 5 minutes via GitHub Actions
// Fetches → Dedupes → Scores → Buffers to temp file
// Separate commit.js runs every 30 min to flush buffer to disk

import { fetchAllSources }       from "./src/fetcher.js";
import { deduplicateItems }      from "./src/dedupe.js";
import { scoreItems }            from "./src/scorer.js";
import { bufferItems, loadBuffer } from "./src/buffer.js";
import { log, errorLog }         from "./src/utils.js";

async function run() {
  const startTime = Date.now();
  log("Pipeline started");

  try {
    // 1. Fetch from all 16 sources
    log("Fetching from all sources...");
    const raw = await fetchAllSources();
    log(`Fetched ${raw.length} raw items`);

    if (!raw.length) {
      log("No items fetched — exiting");
      return;
    }

    // 2. Load existing buffer to dedupe against
    const existing = await loadBuffer();
    const existingUrls   = new Set(existing.map(i => i.url));
    const existingTitles = new Set(existing.map(i => i.title?.toLowerCase().trim()));

    // 3. Deduplicate
    const fresh = deduplicateItems(raw, existingUrls, existingTitles);
    log(`${fresh.length} new items after deduplication`);

    if (!fresh.length) {
      log("No new items — skipping score and buffer");
      return;
    }

    // 4. Score with Gemini Flash (single batch request)
    log("Scoring with Gemini Flash...");
    const scored = await scoreItems(fresh);
    log(`Scored ${scored.length} items`);

    // Filter out noise (score 0-2)
    const quality = scored.filter(i => i.score > 2);
    log(`${quality.length} items passed quality filter (score > 2)`);

    if (!quality.length) {
      log("All items filtered as noise — exiting");
      return;
    }

    // 5. Buffer items — commit.js will flush every 30 min
    await bufferItems(quality);
    log(`Buffered ${quality.length} items`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Pipeline complete in ${elapsed}s`);

  } catch (err) {
    errorLog("Pipeline failed:", err);
    process.exit(1);
  }
}

run();
