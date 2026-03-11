// AI Radar Backend — Buffer (src/buffer.js)
// Accumulates fetched items between 5-min runs
// commit.js flushes buffer every 30 min

import { readFileSync, writeFileSync, existsSync } from "fs";
import { log } from "./utils.js";

const BUFFER_FILE = "./data/buffer.json";

export async function loadBuffer() {
  try {
    if (!existsSync(BUFFER_FILE)) return [];
    const raw = readFileSync(BUFFER_FILE, "utf8");
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

export async function bufferItems(items) {
  const existing = await loadBuffer();
  const merged   = [...existing, ...items];
  writeFileSync(BUFFER_FILE, JSON.stringify(merged, null, 2));
  log(`Buffer now has ${merged.length} items`);
}

export async function clearBuffer() {
  writeFileSync(BUFFER_FILE, JSON.stringify([], null, 2));
}
