// AI Radar Backend — Deduplication (src/dedupe.js)

export function deduplicateItems(incoming, existingUrls = new Set(), existingTitles = new Set()) {
  const seenUrls   = new Set(existingUrls);
  const seenTitles = new Set(existingTitles);
  const result     = [];

  for (const item of incoming) {
    const url   = normalizeUrl(item.url);
    const title = item.title?.toLowerCase().trim();

    if (!url && !title) continue;
    if (url   && seenUrls.has(url))     continue;
    if (title && seenTitles.has(title)) continue;

    // Fuzzy title check — catch near-duplicates
    if (title && isSimilarTitle(title, seenTitles)) continue;

    if (url)   seenUrls.add(url);
    if (title) seenTitles.add(title);
    result.push(item);
  }

  return result;
}

function normalizeUrl(raw = "") {
  try {
    const u = new URL(raw);
    ["utm_source","utm_medium","utm_campaign","ref","fbclid","source"]
      .forEach(p => u.searchParams.delete(p));
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

// Simple fuzzy check — if >80% of words match an existing title, it's a duplicate
function isSimilarTitle(title, seenTitles) {
  const words = title.split(/\s+/).filter(w => w.length > 4);
  if (words.length < 4) return false;

  for (const existing of seenTitles) {
    const matchCount = words.filter(w => existing.includes(w)).length;
    if (matchCount / words.length > 0.8) return true;
  }
  return false;
}
