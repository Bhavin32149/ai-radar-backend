// AI Radar Backend — Gemini Flash Scorer (src/scorer.js)
// Uses single batch request to bypass 15 RPM free tier limit
// Falls back to keyword scoring if Gemini is unavailable

import { GoogleGenerativeAI } from "@google/generative-ai";
import { log, errorLog, sleep } from "./utils.js";

const BATCH_SIZE  = 40;
const BATCH_DELAY = 65_000; // 65s between batches — safely under 15 RPM

// ── Keyword fallback scorer ───────────────────────────────────────────────────

const HIGH_KEYWORDS = [
  "gpt-5","gpt5","claude 4","claude-4","gemini 2","gemini-2",
  "llama 4","llama4","deepseek","mistral","phi-4","phi4","qwen",
  "new model","model release","released","launches","breakthrough",
  "state-of-the-art","sota","beats","surpasses","outperforms",
  "agi","superintelligence","major update","o3","o4","o1",
  "openai","anthropic","google deepmind","meta ai","nvidia",
  "trillion parameter","multimodal","reasoning model",
];

const MEDIUM_KEYWORDS = [
  "tool","launch","open source","repo","library","framework",
  "fine-tune","fine tuning","rlhf","rag","vector","embedding",
  "agent","autonomous","startup","funding","series a","series b",
  "huggingface","github","api","sdk","benchmark","dataset",
];

function keywordScore(item) {
  const text = `${item.title} ${item.source} ${item.abstract}`.toLowerCase();
  for (const kw of HIGH_KEYWORDS)   if (text.includes(kw)) return { score: 8.0, priority: "HIGH",   sentiment: "positive" };
  for (const kw of MEDIUM_KEYWORDS) if (text.includes(kw)) return { score: 6.0, priority: "MEDIUM", sentiment: "neutral"  };
  if ((item.stars || 0) > 1000 || (item.votes || 0) > 100 || (item.points || 0) > 200)
    return { score: 6.5, priority: "MEDIUM", sentiment: "positive" };
  if ((item.downloads || 0) >= 1000 || (item.likes || 0) >= 20)
    return { score: 6.0, priority: "MEDIUM", sentiment: "neutral" };
  return { score: 4.0, priority: "LOW", sentiment: "neutral" };
}

// ── Priority from score ───────────────────────────────────────────────────────

function priorityFromScore(score) {
  if (score >= 9) return "HIGH";
  if (score >= 6) return "MEDIUM";
  if (score >= 3) return "LOW";
  return "NOISE";
}

// ── Main scorer ───────────────────────────────────────────────────────────────

export async function scoreItems(items) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    log("No GEMINI_API_KEY — using keyword fallback scoring");
    return items.map(item => ({ ...item, ...keywordScore(item) }));
  }

  try {
    return await scoreWithGemini(items, apiKey);
  } catch (err) {
    errorLog("Gemini scoring failed, falling back to keyword scoring:", err.message);
    return items.map(item => ({ ...item, ...keywordScore(item) }));
  }
}

async function scoreWithGemini(items, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const scored = [...items];

  // Process in batches of 40 to stay under RPM limit
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    if (i > 0) {
      log(`  Waiting ${BATCH_DELAY / 1000}s between batches...`);
      await sleep(BATCH_DELAY);
    }

    // Build condensed input — only id, title, abstract
    const input = batch.map(item => ({
      id:       item.id,
      title:    item.title,
      abstract: item.abstract?.slice(0, 100) || "",
    }));

    const prompt = `You are an AI news quality scorer. Analyze these AI news items and score each from 0-10.

Scoring criteria:
- 9-10: Major model releases, breakthroughs, significant research (GPT-5, Claude 4, SOTA results)
- 6-8: Important tools, good papers, notable launches, funding news
- 3-5: Routine updates, minor releases, general AI news
- 0-2: Noise, spam, irrelevant, low quality

Also detect sentiment: "positive", "negative", or "neutral"

Items to score:
${JSON.stringify(input)}

Return ONLY a valid JSON array. No markdown, no explanation. Format:
[{"id":"item_id","score":8.5,"sentiment":"positive"}]`;

    try {
      const result   = await model.generateContent(prompt);
      const text     = result.response.text().trim();
      const clean    = text.replace(/```json|```/g, "").trim();
      const scores   = JSON.parse(clean);

      // Merge scores back into items
      const scoreMap = new Map(scores.map(s => [s.id, s]));
      for (let j = i; j < i + batch.length; j++) {
        const geminiScore = scoreMap.get(scored[j].id);
        if (geminiScore) {
          const score    = Number(geminiScore.score) || 0;
          scored[j].score     = score;
          scored[j].priority  = priorityFromScore(score);
          scored[j].sentiment = geminiScore.sentiment || "neutral";
        } else {
          // Fallback for items Gemini didn't return
          Object.assign(scored[j], keywordScore(scored[j]));
        }
      }

      log(`  Scored batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)}`);

    } catch (batchErr) {
      errorLog(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed, using keyword fallback:`, batchErr.message);
      for (let j = i; j < i + batch.length; j++) {
        Object.assign(scored[j], keywordScore(scored[j]));
      }
    }
  }

  return scored;
}
