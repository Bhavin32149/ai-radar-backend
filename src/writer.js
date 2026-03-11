// AI Radar Backend — Writer (src/writer.js)
// Writes all JSON output files with smart change detection

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createHash } from "crypto";
import { log, todayKey, MONTH_NAMES } from "./utils.js";

const DATA_DIR = "./data";

// ── Load existing day file ────────────────────────────────────────────────────

export async function loadExistingDay(dateKey) {
  const path = dayFilePath(dateKey);
  try {
    if (!existsSync(path)) return [];
    const raw  = readFileSync(path, "utf8");
    const data = JSON.parse(raw);
    return data.items || [];
  } catch {
    return [];
  }
}

// ── Write all files ───────────────────────────────────────────────────────────

export async function writeAllFiles({ items, trending, summary, dateKey }) {
  ensureDir(DATA_DIR);

  const breaking = items
    .filter(i => i.score >= 9)
    .slice(0, 10);

  const latest = {
    generatedAt: new Date().toISOString(),
    date:        dateKey,
    count:       items.length,
    summary:     summary || null,
    items:       items.slice(0, 60), // cap latest.json at 60 items ~100KB
  };

  const breakingOut = {
    generatedAt: new Date().toISOString(),
    count:       breaking.length,
    items:       breaking,
  };

  const dayData = {
    generatedAt: new Date().toISOString(),
    date:        dateKey,
    count:       items.length,
    summary:     summary || null,
    items,
  };

  // Write day archive file
  const dayPath = dayFilePath(dateKey);
  ensureDir(dayPath.split("/").slice(0, -1).join("/"));
  smartWrite(dayPath, dayData);

  // Write latest.json
  smartWrite(`${DATA_DIR}/latest.json`, latest);

  // Write breaking.json
  smartWrite(`${DATA_DIR}/breaking.json`, breakingOut);

  // Write trending.json
  if (trending) smartWrite(`${DATA_DIR}/trending.json`, trending);

  // Update index.json
  updateIndex(dateKey);

  // Write metadata.json
  writeMetadata(items, trending);

  log(`Wrote ${items.length} items to ${dayPath}`);
  log(`Wrote latest.json (${items.slice(0,60).length} items), breaking.json (${breaking.length} items)`);
}

// ── Smart write — skip if content unchanged ───────────────────────────────────

function smartWrite(path, data) {
  const json = JSON.stringify(data, null, 2);
  const hash = createHash("md5").update(json).digest("hex");

  if (existsSync(path)) {
    const existing     = readFileSync(path, "utf8");
    const existingHash = createHash("md5").update(existing).digest("hex");
    if (hash === existingHash) {
      log(`  Skipping ${path} — no changes`);
      return false;
    }
  }

  writeFileSync(path, json);
  log(`  Wrote ${path}`);
  return true;
}

// ── Index.json management ─────────────────────────────────────────────────────

function updateIndex(dateKey) {
  const indexPath = `${DATA_DIR}/index.json`;
  let dates = [];

  if (existsSync(indexPath)) {
    try {
      dates = JSON.parse(readFileSync(indexPath, "utf8"));
    } catch { dates = []; }
  }

  if (!dates.includes(dateKey)) {
    dates.unshift(dateKey);
    // Keep sorted descending
    dates.sort((a, b) => {
      const toMs = k => {
        const [dd, mm, yyyy] = k.split("-");
        return new Date(`${yyyy}-${mm}-${dd}`).getTime();
      };
      return toMs(b) - toMs(a);
    });
    writeFileSync(indexPath, JSON.stringify(dates, null, 2));
    log(`  Updated index.json (${dates.length} dates)`);
  }
}

// ── Metadata.json ─────────────────────────────────────────────────────────────

function writeMetadata(items, trending) {
  const meta = {
    lastUpdated:  new Date().toISOString(),
    todayCount:   items.length,
    highCount:    items.filter(i => i.priority === "HIGH").length,
    mediumCount:  items.filter(i => i.priority === "MEDIUM").length,
    topTrending:  trending?.trending?.slice(0, 3) || [],
    version:      "2.0.0",
  };
  smartWrite(`${DATA_DIR}/metadata.json`, meta);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dayFilePath(dateKey) {
  const [dd, mm, yyyy] = dateKey.split("-");
  const month = MONTH_NAMES[parseInt(mm, 10) - 1];
  return `${DATA_DIR}/${yyyy}/${month}/${dateKey}.json`;
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}
