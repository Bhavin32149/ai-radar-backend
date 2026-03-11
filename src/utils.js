// AI Radar Backend — Utilities (src/utils.js)

export const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function todayKey() {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function log(...args) {
  console.log(`[AI Radar ${new Date().toISOString()}]`, ...args);
}

export function errorLog(...args) {
  console.error(`[AI Radar ERROR ${new Date().toISOString()}]`, ...args);
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function safeFetch(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        await sleep(Math.min(1000 * 2 ** i, 8000));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(Math.min(1000 * 2 ** i, 8000));
    }
  }
}

export function parseXML(text, tag) {
  const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}
