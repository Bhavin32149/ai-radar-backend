// AI Radar Backend — Daily Summary (src/summary.js)
// Generates a 5-bullet daily summary using Gemini Flash
// Only runs ONCE per day (when existing.length === 0 on first commit run)

import { GoogleGenerativeAI } from "@google/generative-ai";
import { log, errorLog }      from "./utils.js";

export async function generateSummary(items, isFirstRunOfDay) {
  // Only generate on first commit run of the day to save tokens
  if (!isFirstRunOfDay) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !items.length) return null;

  // Use only HIGH priority items for summary
  const highlights = items
    .filter(i => i.priority === "HIGH")
    .slice(0, 15)
    .map(i => `- ${i.title} (${i.source})`)
    .join("\n");

  if (!highlights) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are an AI news analyst. Based on these top AI news items, write a concise daily summary in exactly 5 bullet points. Each bullet should be one clear sentence highlighting the most important development. Focus on what matters for AI researchers, developers and enthusiasts.

Top items:
${highlights}

Return ONLY a JSON object. No markdown, no explanation:
{"highlights":["bullet 1","bullet 2","bullet 3","bullet 4","bullet 5"]}`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();
    const clean  = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    log("Daily summary generated");
    return {
      date:       new Date().toISOString().split("T")[0],
      highlights: parsed.highlights || [],
    };

  } catch (err) {
    errorLog("Summary generation failed:", err.message);
    return null;
  }
}
