// AI Radar Backend — Fetcher (src/fetcher.js)
// Fetches from 16 sources, normalizes to common schema

import { safeFetch, parseXML, sleep, log, errorLog } from "./utils.js";

const DELAY_BETWEEN_SOURCES = 500; // ms — avoid rate limiting

// ── Main export ───────────────────────────────────────────────────────────────

export async function fetchAllSources() {
  const sources = [
    { name: "Hacker News",           fn: fetchHackerNews },
    { name: "HuggingFace Papers",    fn: fetchHuggingFacePapers },
    { name: "HuggingFace Models",    fn: fetchHuggingFaceModels },
    { name: "ArXiv AI",              fn: fetchArxiv },
    { name: "GitHub Trending",       fn: fetchGitHub },
    { name: "Reddit LocalLLaMA",     fn: fetchRedditLocalLLaMA },
    { name: "Reddit MachineLearning",fn: fetchRedditML },
    { name: "Papers With Code",      fn: fetchPapersWithCode },
    { name: "OpenAI Blog",           fn: fetchOpenAIBlog },
    { name: "Anthropic Blog",        fn: fetchAnthropicBlog },
    { name: "DeepMind Blog",         fn: fetchDeepMindBlog },
    { name: "Meta AI Blog",          fn: fetchMetaAIBlog },
    { name: "NVIDIA Blog",           fn: fetchNvidiaBlog },
    { name: "VentureBeat AI",        fn: fetchVentureBeat },
    { name: "TechCrunch AI",         fn: fetchTechCrunch },
    { name: "Product Hunt AI",       fn: fetchProductHunt },
  ];

  const results = [];

  for (const source of sources) {
    try {
      const items = await source.fn();
      results.push(...items);
      log(`  ✓ ${source.name}: ${items.length} items`);
    } catch (err) {
      errorLog(`  ✗ ${source.name} failed:`, err.message);
    }
    await sleep(DELAY_BETWEEN_SOURCES);
  }

  return results;
}

// ── Normalizer ────────────────────────────────────────────────────────────────

function normalize(item) {
  return {
    id:          String(item.id || ""),
    title:       String(item.title || "").slice(0, 200).trim(),
    url:         String(item.url || ""),
    source:      String(item.source || ""),
    sourceIcon:  String(item.sourceIcon || "📡"),
    type:        item.type || "news",
    timestamp:   item.timestamp || new Date().toISOString(),
    abstract:    String(item.abstract || "").slice(0, 200).trim(),
    authors:     Array.isArray(item.authors) ? item.authors.slice(0, 5) : [],
    tags:        Array.isArray(item.tags)    ? item.tags.slice(0, 10)   : [],
    score:       0,
    priority:    "LOW",
    sentiment:   "neutral",
    // Engagement metrics for ranking
    downloads:   Number(item.downloads || 0),
    likes:       Number(item.likes     || 0),
    stars:       Number(item.stars     || 0),
    votes:       Number(item.votes     || 0),
    points:      Number(item.points    || 0),
  };
}

// ── 1. Hacker News ────────────────────────────────────────────────────────────

async function fetchHackerNews() {
  const url = "https://hn.algolia.com/api/v1/search_by_date?query=%22AI%22+OR+%22LLM%22+OR+%22machine+learning%22&tags=story&hitsPerPage=30";
  const res  = await safeFetch(url);
  const data = await res.json();

  return (data.hits || [])
    .filter(h => h.title && (h.points || 0) > 5)
    .map(h => normalize({
      id:         `hn_${h.objectID}`,
      title:      h.title,
      url:        h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      source:     "Hacker News",
      sourceIcon: "⚡",
      type:       hnType(h.title),
      timestamp:  h.created_at,
      points:     h.points || 0,
      tags:       extractTags(h.title),
    }));
}

function hnType(title = "") {
  const t = title.toLowerCase();
  if (t.match(/\b(model|llm|gpt|claude|gemini|llama|mistral)\b/)) return "model";
  if (t.match(/\b(paper|research|arxiv|study|benchmark)\b/))        return "research";
  if (t.match(/\b(tool|app|launch|sdk|library|framework|api)\b/))   return "tool";
  return "news";
}

// ── 2. HuggingFace Papers ────────────────────────────────────────────────────

async function fetchHuggingFacePapers() {
  const res  = await safeFetch("https://huggingface.co/api/daily_papers");
  const data = await res.json();

  return (Array.isArray(data) ? data : []).slice(0, 20).map(p => normalize({
    id:        `hf_paper_${p.paper?.id || p.id}`,
    title:     p.title || p.paper?.title || "",
    url:       p.paper?.id ? `https://huggingface.co/papers/${p.paper.id}` : "https://huggingface.co/papers",
    source:    "HuggingFace Papers",
    sourceIcon:"🤗",
    type:      "research",
    timestamp: p.publishedAt || p.paper?.publishedAt,
    abstract:  p.paper?.summary || "",
    authors:   p.paper?.authors?.map(a => a.name) || [],
    tags:      extractTags(p.title || p.paper?.title || ""),
  }));
}

// ── 3. HuggingFace Models (quality filtered) ─────────────────────────────────

async function fetchHuggingFaceModels() {
  const res  = await safeFetch("https://huggingface.co/api/models?sort=lastModified&direction=-1&limit=60&full=true");
  const data = await res.json();

  return (Array.isArray(data) ? data : [])
    .filter(m => m.pipeline_tag && (m.downloads || 0) >= 10 && (m.likes || 0) >= 1)
    .slice(0, 20)
    .map(m => normalize({
      id:        `hf_model_${m.id}`,
      title:     m.id || "Unknown Model",
      url:       `https://huggingface.co/${m.id}`,
      source:    "HuggingFace Models",
      sourceIcon:"🤗",
      type:      "model",
      timestamp: m.lastModified,
      tags:      [m.pipeline_tag, ...(m.tags || [])].filter(Boolean),
      downloads: m.downloads || 0,
      likes:     m.likes || 0,
    }));
}

// ── 4. ArXiv ─────────────────────────────────────────────────────────────────

async function fetchArxiv() {
  const url = "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&sortBy=lastUpdatedDate&sortOrder=descending&max_results=20";
  const res  = await safeFetch(url);
  const text = await res.text();

  const items   = [];
  const pattern = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const e       = match[1];
    const id      = parseXML(e, "id");
    const title   = parseXML(e, "title")?.replace(/\s+/g, " ").trim();
    const updated = parseXML(e, "updated");
    const summary = parseXML(e, "summary")?.replace(/\s+/g, " ").trim();
    const arxivId = id?.split("/abs/")[1];

    // Extract authors
    const authors = [];
    const authorPattern = /<author>([\s\S]*?)<\/author>/g;
    let am;
    while ((am = authorPattern.exec(e)) !== null) {
      const name = parseXML(am[1], "name");
      if (name) authors.push(name);
    }

    if (title && arxivId) {
      items.push(normalize({
        id:        `arxiv_${arxivId}`,
        title,
        url:       `https://arxiv.org/abs/${arxivId}`,
        source:    "ArXiv",
        sourceIcon:"📄",
        type:      "research",
        timestamp: updated,
        abstract:  summary || "",
        authors:   authors.slice(0, 5),
        tags:      extractTags(title),
      }));
    }
  }

  return items.slice(0, 15);
}

// ── 5. GitHub ────────────────────────────────────────────────────────────────

async function fetchGitHub() {
  const url = "https://api.github.com/search/repositories?q=AI+OR+LLM+OR+%22machine+learning%22&sort=stars&order=desc&per_page=20";
  const res  = await safeFetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "AI-Radar-Bot/2.0" } });
  const data = await res.json();

  return (data.items || [])
    .filter(r => (r.stargazers_count || 0) > 100)
    .map(r => normalize({
      id:        `gh_${r.id}`,
      title:     `${r.full_name} — ${r.description?.slice(0, 100) || ""}`,
      url:       r.html_url,
      source:    "GitHub",
      sourceIcon:"⭐",
      type:      "tool",
      timestamp: r.pushed_at || r.created_at,
      stars:     r.stargazers_count || 0,
      tags:      [...(r.topics || []), r.language].filter(Boolean),
    }));
}

// ── 6. Reddit r/LocalLLaMA ───────────────────────────────────────────────────

async function fetchRedditLocalLLaMA() {
  return fetchRedditRSS("LocalLLaMA", "Reddit r/LocalLLaMA", "🔴");
}

// ── 7. Reddit r/MachineLearning ──────────────────────────────────────────────

async function fetchRedditML() {
  return fetchRedditRSS("MachineLearning", "Reddit r/MachineLearning", "🔴");
}

async function fetchRedditRSS(subreddit, sourceName, icon) {
  const res  = await safeFetch(`https://www.reddit.com/r/${subreddit}/top/.rss?t=day`, {
    headers: { "User-Agent": "AI-Radar-Bot/2.0" }
  });
  const text = await res.text();

  const items   = [];
  const pattern = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const e     = match[1];
    const title = parseXML(e, "title");
    const href  = e.match(/href="([^"]+)"/)?.[1];
    const upd   = parseXML(e, "updated");
    const id    = parseXML(e, "id");

    if (title && href && !title.includes("Comment by")) {
      items.push(normalize({
        id:        `reddit_${subreddit}_${id || title}`,
        title:     title.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">"),
        url:       href,
        source:    sourceName,
        sourceIcon: icon,
        type:      hnType(title),
        timestamp: upd,
        tags:      extractTags(title),
      }));
    }
  }

  return items.slice(0, 15);
}

// ── 8. Papers With Code ──────────────────────────────────────────────────────

async function fetchPapersWithCode() {
  return fetchRSSBlog("https://paperswithcode.com/latest/rss", "Papers With Code", "📊", "research");
}

// ── RSS helper ────────────────────────────────────────────────────────────────

async function fetchRSSBlog(url, sourceName, icon, type = "news") {
  const res  = await safeFetch(url, { headers: { "User-Agent": "AI-Radar-Bot/2.0" } });
  const text = await res.text();

  // Try RSS <item> format first, then Atom <entry>
  const isAtom  = text.includes("<entry>");
  const tagName = isAtom ? "entry" : "item";
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "g");

  const items = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const e     = match[1];
    const title = parseXML(e, "title")?.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const link  = parseXML(e, "link") || e.match(/href="([^"]+)"/)?.[1];
    const date  = parseXML(e, "pubDate") || parseXML(e, "published") || parseXML(e, "updated");
    const desc  = parseXML(e, "description") || parseXML(e, "summary") || "";
    const clean = desc.replace(/<[^>]*>/g, "").slice(0, 200);

    if (title && link) {
      items.push(normalize({
        id:        `${sourceName.toLowerCase().replace(/\s+/g,"_")}_${encodeURIComponent(link).slice(0,40)}`,
        title,
        url:       link,
        source:    sourceName,
        sourceIcon: icon,
        type,
        timestamp: date ? new Date(date).toISOString() : new Date().toISOString(),
        abstract:  clean,
        tags:      extractTags(title),
      }));
    }
  }

  return items.slice(0, 10);
}

// ── 9-15. Blog RSS sources ────────────────────────────────────────────────────

async function fetchOpenAIBlog() {
  return fetchRSSBlog("https://openai.com/blog/rss.xml", "OpenAI Blog", "🟢", "news");
}

async function fetchAnthropicBlog() {
  return fetchRSSBlog("https://news.mit.edu/topic/artificial-intelligence2", "MIT AI News", "🎓", "research");
}

async function fetchDeepMindBlog() {
  return fetchRSSBlog("https://deepmind.google/blog/rss.xml", "Google DeepMind", "🔵", "research");
}

async function fetchMetaAIBlog() {
  return fetchRSSBlog("https://engineering.fb.com/category/ai-research/feed/", "Meta AI Blog", "🔷", "news");
}

async function fetchNvidiaBlog() {
  return fetchRSSBlog("https://developer.nvidia.com/blog/feed/", "NVIDIA Blog", "🟩", "tool");
}

async function fetchVentureBeat() {
  return fetchRSSBlog("https://venturebeat.com/category/ai/feed/", "VentureBeat AI", "📰", "news");
}

async function fetchTechCrunch() {
  return fetchRSSBlog("https://techcrunch.com/category/artificial-intelligence/feed/", "TechCrunch AI", "💚", "news");
}

// ── 16. Product Hunt ─────────────────────────────────────────────────────────

async function fetchProductHunt() {
  const apiKey = process.env.PRODUCT_HUNT_API_KEY;
  if (!apiKey) return [];

  const query = `{
    posts(first:15, topic:"artificial-intelligence", order:VOTES) {
      edges { node { id name tagline url votesCount createdAt } }
    }
  }`;

  const res  = await safeFetch("https://api.producthunt.com/v2/api/graphql", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify({ query }),
  });
  const data = await res.json();

  return (data?.data?.posts?.edges || []).map(({ node: n }) => normalize({
    id:        `ph_${n.id}`,
    title:     `${n.name} — ${n.tagline}`,
    url:       n.url,
    source:    "Product Hunt",
    sourceIcon:"🚀",
    type:      "tool",
    timestamp: n.createdAt,
    votes:     n.votesCount || 0,
    tags:      extractTags(n.name + " " + n.tagline),
  }));
}

// ── Tag extractor ─────────────────────────────────────────────────────────────

function extractTags(text = "") {
  const t = text.toLowerCase();
  const allTags = [
    "llm","gpt","claude","gemini","llama","mistral","deepseek","qwen","phi",
    "transformer","diffusion","multimodal","rag","agent","fine-tuning",
    "open source","benchmark","inference","training","alignment","safety",
    "computer vision","nlp","reinforcement learning","embeddings",
    "text-to-image","text-to-video","speech","robotics","autonomous",
  ];
  return allTags.filter(tag => t.includes(tag)).slice(0, 5);
}
